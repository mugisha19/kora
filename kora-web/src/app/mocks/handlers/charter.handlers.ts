import { delay, http } from 'msw';
import { CharterMilestone, CharterObjective, Money } from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { CharterRecord, ProjectRecord } from '../data-projects';
import { db } from '../db';
import { currencyDigits } from '../decimal';
import {
  API,
  Validator,
  checkVersion,
  etag,
  ifMatchVersion,
  invalidBody,
  readBody,
  reply,
} from '../http';
import { currentCharter, governs, orgCurrency, toCharter } from '../projects-domain';
import { caller } from './portfolio.handlers';
import { requireEditor, visibleProject } from './project.handlers';

function charterShape(v: Validator, body: Record<string, unknown>, currency: string): void {
  v.string('purpose', body['purpose'], 0, 4000, false);
  v.string('businessCase', body['businessCase'], 0, 8000, false);
  list(v, 'objectives', body['objectives'], 30, (field, item) => {
    v.string(`${field}.text`, item['text'], 1, 500);
    v.string(`${field}.successMetric`, item['successMetric'], 1, 300);
  });
  for (const field of ['inScope', 'outOfScope', 'assumptions', 'constraints', 'highLevelRisks']) {
    v.textList(field, body[field]);
  }
  list(v, 'milestones', body['milestones'], 50, (field, item) => {
    v.string(`${field}.name`, item['name'], 1, 200);
    v.date(`${field}.targetDate`, item['targetDate'], true);
  });
  v.money('summaryBudget', body['summaryBudget'], currency, currencyDigits(currency));
  v.uuid('sponsorId', body['sponsorId']);
}

/** An optional array of objects, each checked by `each` with its indexed field name. */
function list(
  v: Validator,
  field: string,
  value: unknown,
  max: number,
  each: (field: string, item: Record<string, unknown>) => void,
): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    v.add(field, 'invalid', 'must be a list');
    return;
  }
  if (value.length > max) {
    v.add(field, 'length', `at most ${max} items`, { max });
    return;
  }
  value.forEach((item: unknown, index) => {
    if (typeof item !== 'object' || item === null)
      v.add(`${field}[${index}]`, 'invalid', 'must be an object');
    else each(`${field}[${index}]`, item as Record<string, unknown>);
  });
}

/** The charter of a project the caller can see (every project has one from creation). */
function charterOf(project: ProjectRecord): CharterRecord {
  const charter = currentCharter(project.id);
  if (!charter) throw new Error(`project ${project.code} has no charter`);
  return charter;
}

/** The sponsor joins the project team as an observer so they can see what they approve. */
function addSponsorToTeam(project: ProjectRecord, sponsorId: string): void {
  const already =
    project.managerId === sponsorId ||
    db.state.projectMembers.some((m) => m.projectId === project.id && m.userId === sponsorId);
  if (!already) {
    db.state.projectMembers.push({
      projectId: project.id,
      userId: sponsorId,
      projectRole: 'OBSERVER',
      addedAt: new Date().toISOString(),
    });
  }
}

function canDecide(charter: CharterRecord, membership: MembershipRecord): boolean {
  return governs(membership.role) || charter.sponsorId === membership.userId;
}

export const charterHandlers = [
  http.get(`${API}/projects/:projectId/charter`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const charter = charterOf(project);
    return r.json(toCharter(charter), 200, etag(charter.version));
  }),

  http.put(`${API}/projects/:projectId/charter`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    charterShape(v, body, orgCurrency(membership.organizationId));
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    const charter = charterOf(project);
    const stale = checkVersion(r, sent, charter.version);
    if (stale) return stale;
    const sponsorId = body['sponsorId'] as string | undefined;
    if (sponsorId && !db.membership(sponsorId, project.organizationId)) {
      const domain = new Validator();
      domain.add('sponsorId', 'invalid', 'must be a member of the organization');
      return domain.problem(r);
    }
    if (charter.status !== 'DRAFT') return r.problem(409, 'charters.not_draft');

    const text = (key: string) => {
      const value = typeof body[key] === 'string' ? body[key].trim() : '';
      return value || undefined;
    };
    const strings = (key: string) =>
      (body[key] as string[] | undefined)?.map((s) => s.trim()) ?? [];
    Object.assign(charter, {
      purpose: text('purpose'),
      businessCase: text('businessCase'),
      objectives: (body['objectives'] as CharterObjective[] | undefined) ?? [],
      inScope: strings('inScope'),
      outOfScope: strings('outOfScope'),
      assumptions: strings('assumptions'),
      constraints: strings('constraints'),
      highLevelRisks: strings('highLevelRisks'),
      milestones: (body['milestones'] as CharterMilestone[] | undefined) ?? [],
      summaryBudget: body['summaryBudget'] as Money | undefined,
      sponsorId,
      version: charter.version + 1,
    } satisfies Partial<CharterRecord>);
    if (sponsorId) addSponsorToTeam(project, sponsorId);
    db.save();
    return r.json(toCharter(charter), 200, etag(charter.version));
  }),

  http.post(`${API}/projects/:projectId/charter/submit`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    const charter = charterOf(project);
    if (charter.status !== 'DRAFT') return r.problem(409, 'charters.not_draft');
    const missing = new Validator();
    if (!charter.purpose) missing.add('purpose', 'required', 'a purpose is required');
    if (!charter.objectives.length) missing.add('objectives', 'required', 'at least one objective');
    if (!charter.sponsorId) missing.add('sponsorId', 'required', 'a sponsor is required');
    if (!missing.ok) return r.problem(409, 'charters.incomplete', { errors: missing.errors });

    charter.status = 'SUBMITTED';
    charter.submittedAt = new Date().toISOString();
    delete charter.returnComment;
    charter.version += 1;
    db.save();
    return r.json(toCharter(charter), 200, etag(charter.version));
  }),

  http.post(`${API}/projects/:projectId/charter/approve`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const charter = charterOf(project);
    if (!canDecide(charter, membership)) return r.problem(403, 'access.denied');
    if (charter.status !== 'SUBMITTED') return r.problem(409, 'charters.not_submitted');

    charter.status = 'APPROVED';
    charter.approvedById = membership.userId;
    charter.approvedAt = new Date().toISOString();
    charter.version += 1;
    // Approval is what authorizes the project (PROPOSED → APPROVED is not a manual transition).
    if (project.status === 'PROPOSED') {
      project.status = 'APPROVED';
      project.version += 1;
    }
    db.save();
    return r.json(toCharter(charter), 200, etag(charter.version));
  }),

  http.post(`${API}/projects/:projectId/charter/return`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('comment', body['comment'], 1, 2000);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const charter = charterOf(project);
    if (!canDecide(charter, membership)) return r.problem(403, 'access.denied');
    if (charter.status !== 'SUBMITTED') return r.problem(409, 'charters.not_submitted');

    charter.status = 'DRAFT';
    charter.returnComment = String(body['comment']).trim();
    delete charter.submittedAt;
    charter.version += 1;
    db.save();
    return r.json(toCharter(charter), 200, etag(charter.version));
  }),

  http.get(`${API}/projects/:projectId/charter/versions`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(
      db.state.charters
        .filter((c) => c.projectId === project.id)
        .sort((a, b) => b.versionNumber - a.versionNumber)
        .map(toCharter),
    );
  }),
];
