import { http } from 'msw';
import {
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_TYPES,
  ChangeImpact,
  ChangeRequestType,
} from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { ChangeRequestRecord } from '../data-governance';
import { ProjectRecord } from '../data-projects';
import { db } from '../db';
import { currencyDigits } from '../decimal';
import {
  applyApprovedChange,
  awaits,
  canEditChangeRequest,
  chainFor,
  changeControlOf,
  inReview,
  mayDecide,
  pendingStep,
  toChangeControl,
  toChangeRequest,
} from '../governance-domain';
import {
  API,
  Reply,
  Validator,
  checkPathId,
  checkVersion,
  etag,
  ifMatchVersion,
  invalidBody,
  latency,
  paging,
  readBody,
  reply,
  requireRole,
  sortAndPage,
} from '../http';
import { canSee, orgCurrency } from '../projects-domain';
import { manages, participates } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

function visibleRequest(
  r: Reply,
  membership: MembershipRecord,
  requestId: unknown,
): { request: ChangeRequestRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'changeRequestId', requestId);
  if (badId) return badId;
  const request = db.state.changeRequests.find((c) => c.id === requestId);
  const project = request && db.state.projects.find((p) => p.id === request.projectId);
  return request && project && canSee(project, membership)
    ? { request, project }
    : r.problem(404, 'resource.not_found');
}

function requestShape(
  v: Validator,
  body: Record<string, unknown>,
  creating: boolean,
  currency: string,
): void {
  if (!creating && Object.keys(body).length === 0) {
    v.add('body', 'required', 'send at least one field');
  }
  if (creating || body['title'] !== undefined) v.string('title', body['title'], 1, 200);
  if (body['description'] !== undefined) {
    v.string('description', body['description'], 0, 4000, false);
  }
  if (creating || body['reason'] !== undefined) v.string('reason', body['reason'], 1, 2000);
  if (creating || body['type'] !== undefined) v.oneOf('type', body['type'], CHANGE_REQUEST_TYPES);
  if (creating) v.uuid('issueId', body['issueId']);
  const impact = body['impact'];
  if (impact === undefined || impact === null) return;
  if (typeof impact !== 'object') {
    v.add('impact', 'invalid', 'must be an object');
    return;
  }
  const i = impact as Record<string, unknown>;
  v.money('impact.costDelta', i['costDelta'], currency, currencyDigits(currency));
  const days = i['scheduleDeltaDays'];
  if (days !== undefined && days !== null) {
    if (typeof days !== 'number' || !Number.isInteger(days)) {
      v.add('impact.scheduleDeltaDays', 'invalid', 'must be a whole number');
    } else v.number('impact.scheduleDeltaDays', days, -1000, 1000);
  }
  if (i['scopeSummary'] !== undefined) {
    v.string('impact.scopeSummary', i['scopeSummary'], 0, 2000, false);
  }
  if (i['riskSummary'] !== undefined) {
    v.string('impact.riskSummary', i['riskSummary'], 0, 2000, false);
  }
  const charter = i['changesCharterScope'];
  if (charter !== undefined && typeof charter !== 'boolean') {
    v.add('impact.changesCharterScope', 'invalid', 'must be true or false');
  }
}

function toImpact(value: unknown): ChangeImpact {
  const i = (value ?? {}) as Record<string, unknown>;
  const text = (field: string) =>
    typeof i[field] === 'string' && (i[field] as string).trim()
      ? { [field]: (i[field] as string).trim() }
      : {};
  return {
    ...(i['costDelta'] ? { costDelta: i['costDelta'] as ChangeImpact['costDelta'] } : {}),
    ...(typeof i['scheduleDeltaDays'] === 'number'
      ? { scheduleDeltaDays: i['scheduleDeltaDays'] }
      : {}),
    ...text('scopeSummary'),
    ...text('riskSummary'),
    changesCharterScope: i['changesCharterScope'] === true,
  };
}

function apply(record: ChangeRequestRecord, body: Record<string, unknown>): void {
  if (body['title'] !== undefined) record.title = String(body['title']).trim();
  if (body['description'] !== undefined) record.description = String(body['description']);
  if (body['reason'] !== undefined) record.reason = String(body['reason']).trim();
  if (body['type'] !== undefined) record.type = body['type'] as ChangeRequestType;
  if (body['impact'] !== undefined) record.impact = toImpact(body['impact']);
}

const invalidTransition = (r: Reply) => r.problem(409, 'change_requests.invalid_transition');
const nextNumber = (projectId: string) =>
  Math.max(
    0,
    ...db.state.changeRequests.filter((c) => c.projectId === projectId).map((c) => c.number),
  ) + 1;

export const changeRequestHandlers = [
  http.get(`${API}/projects/:projectId/change-requests`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const v = new Validator();
    v.oneOf('status', status, CHANGE_REQUEST_STATUSES, false);
    const page = paging(url, ['createdAt'], 'createdAt,desc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;

    const requests = db.state.changeRequests
      .filter((c) => c.projectId === project.id && (!status || c.status === status))
      .map(toChangeRequest);
    return r.json(sortAndPage(requests, page, { createdAt: (c) => c.createdAt }));
  }),

  http.post(`${API}/projects/:projectId/change-requests`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    requestShape(v, body, true, orgCurrency(membership.organizationId));
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!participates(project, membership)) return r.problem(403, 'access.denied');
    const issueId = body['issueId'];
    const issue =
      typeof issueId === 'string'
        ? db.state.issues.find((i) => i.id === issueId && i.projectId === project.id)
        : undefined;
    if (typeof issueId === 'string' && !issue) {
      const domain = new Validator();
      domain.add('issueId', 'invalid', 'must be an issue of this project');
      return domain.problem(r);
    }

    const record: ChangeRequestRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number: nextNumber(project.id),
      revision: 1,
      title: '',
      reason: '',
      type: body['type'] as ChangeRequestType,
      status: 'DRAFT',
      impact: { changesCharterScope: false },
      requestedById: membership.userId,
      ...(issue ? { issueId: issue.id } : {}),
      steps: [],
      createdAt: new Date().toISOString(),
      version: 1,
    };
    apply(record, body);
    db.state.changeRequests.push(record);
    if (issue) {
      issue.changeRequestId = record.id;
      issue.version += 1;
    }
    db.save();
    return r.json(toChangeRequest(record), 201, {
      Location: `/api/v1/change-requests/${record.id}`,
    });
  }),

  http.get(`${API}/change-requests/:changeRequestId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    return r.json(toChangeRequest(found.request));
  }),

  http.patch(`${API}/change-requests/:changeRequestId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    requestShape(v, body, false, orgCurrency(membership.organizationId));
    if (!v.ok) return v.problem(r);
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    const { request: record, project } = found;
    if (!canEditChangeRequest(record, project, membership)) {
      return r.problem(403, 'access.denied');
    }
    if (record.status !== 'DRAFT') return r.problem(409, 'change_requests.not_draft');
    const stale = checkVersion(r, sent, record.version);
    if (stale) return stale;

    apply(record, body);
    record.version += 1;
    db.save();
    return r.json(toChangeRequest(record));
  }),

  http.post(`${API}/change-requests/:changeRequestId/submit`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    const { request: record, project } = found;
    if (!canEditChangeRequest(record, project, membership)) {
      return r.problem(403, 'access.denied');
    }
    if (record.status !== 'DRAFT') return r.problem(409, 'change_requests.not_draft');

    record.steps = chainFor(record, project);
    record.status = 'SUBMITTED';
    record.submittedAt = new Date().toISOString();
    record.version += 1;
    db.save();
    return r.json(toChangeRequest(record));
  }),

  http.post(`${API}/change-requests/:changeRequestId/decisions`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('decision', body['decision'], ['APPROVE', 'REJECT'] as const);
    if (body['comment'] !== undefined) v.string('comment', body['comment'], 0, 2000, false);
    if (!v.ok) return v.problem(r);
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    const { request: record, project } = found;
    if (!inReview(record)) return r.problem(409, 'change_requests.not_in_review');
    if (record.requestedById === membership.userId) {
      return r.problem(409, 'change_requests.self_approval');
    }
    const step = pendingStep(record);
    if (!step || !mayDecide(step, membership.userId, membership.role, record.requestedById)) {
      return r.problem(403, 'access.denied');
    }
    const comment = typeof body['comment'] === 'string' ? body['comment'].trim() : '';
    const now = new Date().toISOString();

    if (body['decision'] === 'REJECT') {
      if (!comment) {
        const domain = new Validator();
        domain.add('comment', 'required', 'say why it is rejected');
        return domain.problem(r);
      }
      Object.assign(step, {
        state: 'REJECTED',
        decidedById: membership.userId,
        comment,
        decidedAt: now,
      });
      record.steps
        .filter((s) => s.state === 'WAITING' || s.state === 'PENDING')
        .forEach((s) => (s.state = 'SKIPPED'));
      record.status = 'REJECTED';
      record.decidedAt = now;
    } else {
      Object.assign(step, {
        state: 'APPROVED',
        decidedById: membership.userId,
        ...(comment ? { comment } : {}),
        decidedAt: now,
      });
      const next = record.steps.find((s) => s.state === 'WAITING');
      if (next) {
        next.state = 'PENDING';
        record.status = 'IN_REVIEW';
      } else {
        record.status = 'APPROVED';
        record.decidedAt = now;
        applyApprovedChange(record, project, membership.userId);
      }
    }
    record.version += 1;
    db.save();
    return r.json(toChangeRequest(record));
  }),

  http.post(`${API}/change-requests/:changeRequestId/withdraw`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    const { request: record, project } = found;
    if (!canEditChangeRequest(record, project, membership)) {
      return r.problem(403, 'access.denied');
    }
    if (record.status !== 'DRAFT' && !inReview(record)) return invalidTransition(r);

    record.steps
      .filter((s) => s.state === 'WAITING' || s.state === 'PENDING')
      .forEach((s) => (s.state = 'SKIPPED'));
    record.status = 'WITHDRAWN';
    record.version += 1;
    db.save();
    return r.json(toChangeRequest(record));
  }),

  http.post(`${API}/change-requests/:changeRequestId/implement`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    const { request: record, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (record.status !== 'APPROVED') return invalidTransition(r);

    record.status = 'IMPLEMENTED';
    record.version += 1;
    db.save();
    return r.json(toChangeRequest(record));
  }),

  http.post(`${API}/change-requests/:changeRequestId/revise`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRequest(r, membership, params['changeRequestId']);
    if (found instanceof Response) return found;
    const { request: rejected, project } = found;
    if (!canEditChangeRequest(rejected, project, membership)) {
      return r.problem(403, 'access.denied');
    }
    if (rejected.status !== 'REJECTED') return invalidTransition(r);

    const draft: ChangeRequestRecord = {
      ...structuredClone(rejected),
      id: crypto.randomUUID(),
      revision:
        Math.max(
          ...db.state.changeRequests
            .filter((c) => c.projectId === project.id && c.number === rejected.number)
            .map((c) => c.revision),
        ) + 1,
      status: 'DRAFT',
      requestedById: membership.userId,
      previousRevisionId: rejected.id,
      steps: [],
      createdAt: new Date().toISOString(),
      version: 1,
    };
    delete draft.submittedAt;
    delete draft.decidedAt;
    db.state.changeRequests.push(draft);
    db.save();
    return r.json(toChangeRequest(draft), 201, {
      Location: `/api/v1/change-requests/${draft.id}`,
    });
  }),

  http.get(`${API}/approvals/pending`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const projects = new Set(
      db.state.projects
        .filter((p) => p.organizationId === membership.organizationId)
        .map((p) => p.id),
    );
    return r.json(
      db.state.changeRequests
        .filter((c) => projects.has(c.projectId) && awaits(c, membership))
        .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
        .map(toChangeRequest),
    );
  }),

  http.get(`${API}/organization/change-control`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const settings = changeControlOf(membership.organizationId);
    return r.json(toChangeControl(settings), 200, etag(settings.version));
  }),

  http.put(`${API}/organization/change-control`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    for (const field of ['pmoCostPercent', 'sponsorCostPercent'] as const) {
      if (body[field] === undefined || body[field] === null) {
        v.add(field, 'required', `${field} is required`);
      } else v.number(field, body[field], 0, 100);
    }
    const days = body['pmoScheduleDays'];
    if (days === undefined || days === null) {
      v.add('pmoScheduleDays', 'required', 'pmoScheduleDays is required');
    } else if (typeof days !== 'number' || !Number.isInteger(days)) {
      v.add('pmoScheduleDays', 'invalid', 'must be a whole number');
    } else v.number('pmoScheduleDays', days, 0, 1000);
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;
    const current = changeControlOf(membership.organizationId);
    const stale = checkVersion(r, sent, current.version);
    if (stale) return stale;

    const saved = {
      organizationId: membership.organizationId,
      pmoCostPercent: Number(body['pmoCostPercent']),
      pmoScheduleDays: Number(body['pmoScheduleDays']),
      sponsorCostPercent: Number(body['sponsorCostPercent']),
      version: current.version + 1,
    };
    db.state.changeControls = [
      ...db.state.changeControls.filter((c) => c.organizationId !== membership.organizationId),
      saved,
    ];
    db.save();
    return r.json(toChangeControl(saved), 200, etag(saved.version));
  }),
];
