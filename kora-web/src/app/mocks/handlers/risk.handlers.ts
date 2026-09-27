import { http } from 'msw';
import {
  ISSUE_PRIORITIES,
  IssuePriority,
  RESPONSE_STRATEGIES,
  RISK_CATEGORIES,
  RISK_KINDS,
  RISK_PROXIMITIES,
  RISK_SORT_FIELDS,
  RISK_STATUSES,
  RISK_STATUSES_NEEDING_RESPONSE,
  ResponseStrategy,
  RiskCategory,
  RiskHeatmapCell,
  RiskKind,
  RiskProximity,
  RiskStatus,
} from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { IssueRecord, RiskAssessmentRecord, RiskRecord } from '../data-governance';
import { ProjectRecord } from '../data-projects';
import { db } from '../db';
import {
  canManageRisk,
  isOpenRisk,
  orgMember,
  severityOf,
  toAssessment,
  toIssue,
  toRisk,
} from '../governance-domain';
import {
  API,
  Reply,
  Validator,
  checkPathId,
  checkVersion,
  ifMatchVersion,
  invalidBody,
  latency,
  paging,
  readBody,
  reply,
  sortAndPage,
} from '../http';
import { canSee, visibleProjects } from '../projects-domain';
import { participates } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

const ALL_STRATEGIES = [...new Set(Object.values(RESPONSE_STRATEGIES).flat())];
const EDITABLE_STATUSES = RISK_STATUSES.filter((s) => s !== 'CLOSED');

/** The risk named in the path, if the caller can see its project (404 otherwise). */
function visibleRisk(
  r: Reply,
  membership: MembershipRecord,
  riskId: unknown,
): { risk: RiskRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'riskId', riskId);
  if (badId) return badId;
  const risk = db.state.risks.find((x) => x.id === riskId);
  const project = risk && db.state.projects.find((p) => p.id === risk.projectId);
  return risk && project && canSee(project, membership)
    ? { risk, project }
    : r.problem(404, 'resource.not_found');
}

function level(v: Validator, field: string, value: unknown, required: boolean): void {
  if (value === undefined || value === null) {
    if (required) v.add(field, 'required', `${field} is required`);
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    v.add(field, 'invalid', 'must be a whole number');
  } else v.number(field, value, 1, 5);
}

function riskShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0) {
    v.add('body', 'required', 'send at least one field');
  }
  if (creating || body['title'] !== undefined) v.string('title', body['title'], 1, 200);
  if (body['description'] !== undefined) {
    v.string('description', body['description'], 0, 4000, false);
  }
  if (creating || body['category'] !== undefined) {
    v.oneOf('category', body['category'], RISK_CATEGORIES);
  }
  if (body['proximity'] !== undefined) v.oneOf('proximity', body['proximity'], RISK_PROXIMITIES);
  v.uuid('ownerId', body['ownerId']);
  if (body['responseStrategy'] !== undefined) {
    v.oneOf('responseStrategy', body['responseStrategy'], ALL_STRATEGIES);
  }
  if (body['responsePlan'] !== undefined) {
    v.string('responsePlan', body['responsePlan'], 0, 4000, false);
  }
  if (body['triggerConditions'] !== undefined) {
    v.string('triggerConditions', body['triggerConditions'], 0, 2000, false);
  }
  v.date('reviewDate', body['reviewDate']);
  if (creating) {
    v.oneOf('kind', body['kind'], RISK_KINDS);
    level(v, 'probability', body['probability'], true);
    level(v, 'impact', body['impact'], true);
  } else if (body['status'] !== undefined) {
    v.oneOf('status', body['status'], EDITABLE_STATUSES);
  }
}

/** The strategy must suit the kind; planned and monitored risks need a strategy and a plan. */
function riskDomain(
  v: Validator,
  body: Record<string, unknown>,
  project: ProjectRecord,
  current?: RiskRecord,
): void {
  const kind = (body['kind'] as RiskKind | undefined) ?? current?.kind ?? 'THREAT';
  const strategy =
    (body['responseStrategy'] as ResponseStrategy | undefined) ?? current?.responseStrategy;
  if (strategy && !RESPONSE_STRATEGIES[kind].includes(strategy)) {
    v.add('responseStrategy', 'invalid', `not a strategy for a ${kind.toLowerCase()}`);
  }
  const status = (body['status'] as RiskStatus | undefined) ?? current?.status ?? 'IDENTIFIED';
  const plan = (body['responsePlan'] as string | undefined) ?? current?.responsePlan;
  if (RISK_STATUSES_NEEDING_RESPONSE.includes(status)) {
    if (!strategy) v.add('responseStrategy', 'required', `required when ${status}`);
    if (!plan?.trim()) v.add('responsePlan', 'required', `required when ${status}`);
  }
  const ownerId = body['ownerId'];
  if (typeof ownerId === 'string' && !orgMember(project.organizationId, ownerId)) {
    v.add('ownerId', 'invalid', 'is not a member of this organization');
  }
}

function apply(risk: RiskRecord, body: Record<string, unknown>): void {
  if (body['title'] !== undefined) risk.title = String(body['title']).trim();
  if (body['description'] !== undefined) risk.description = String(body['description']);
  if (body['category'] !== undefined) risk.category = body['category'] as RiskCategory;
  if (body['proximity'] !== undefined) risk.proximity = body['proximity'] as RiskProximity;
  if (body['ownerId'] !== undefined) risk.ownerId = String(body['ownerId']);
  if (body['responseStrategy'] !== undefined) {
    risk.responseStrategy = body['responseStrategy'] as ResponseStrategy;
  }
  if (body['responsePlan'] !== undefined) risk.responsePlan = String(body['responsePlan']);
  if (body['triggerConditions'] !== undefined) {
    risk.triggerConditions = String(body['triggerConditions']);
  }
  if (body['reviewDate'] !== undefined) risk.reviewDate = String(body['reviewDate']);
  if (body['status'] !== undefined) risk.status = body['status'] as RiskStatus;
}

function assessmentShape(v: Validator, body: Record<string, unknown>): void {
  level(v, 'probability', body['probability'], true);
  level(v, 'impact', body['impact'], true);
  level(v, 'residualProbability', body['residualProbability'], false);
  level(v, 'residualImpact', body['residualImpact'], false);
  if (body['note'] !== undefined) v.string('note', body['note'], 0, 1000, false);
}

function record(risk: RiskRecord, body: Record<string, unknown>, userId: string) {
  const assessment: RiskAssessmentRecord = {
    id: crypto.randomUUID(),
    riskId: risk.id,
    probability: Number(body['probability']),
    impact: Number(body['impact']),
    ...(body['residualProbability']
      ? { residualProbability: Number(body['residualProbability']) }
      : {}),
    ...(body['residualImpact'] ? { residualImpact: Number(body['residualImpact']) } : {}),
    ...(typeof body['note'] === 'string' && body['note'].trim() ? { note: body['note'] } : {}),
    assessedById: userId,
    assessedAt: new Date().toISOString(),
  };
  db.state.riskAssessments.push(assessment);
  risk.probability = assessment.probability;
  risk.impact = assessment.impact;
  risk.residualProbability = assessment.residualProbability;
  risk.residualImpact = assessment.residualImpact;
  return assessment;
}

const sortKeys = {
  score: (r: ReturnType<typeof toRisk>) => r.score,
  key: (r: ReturnType<typeof toRisk>) => Number(r.key.split('-R').pop()),
  reviewDate: (r: ReturnType<typeof toRisk>) => r.reviewDate ?? '9999-12-31',
  createdAt: (r: ReturnType<typeof toRisk>) => r.createdAt,
};

export const riskHandlers = [
  http.get(`${API}/projects/:projectId/risks/heatmap`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const get = (name: string) => url.searchParams.get(name) ?? undefined;
    const v = new Validator();
    v.oneOf('kind', get('kind'), RISK_KINDS, false);
    v.oneOf('category', get('category'), RISK_CATEGORIES, false);
    v.uuid('ownerId', get('ownerId'));
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;

    const open = db.state.risks.filter(
      (x) =>
        x.projectId === project.id &&
        isOpenRisk(x) &&
        (!get('kind') || x.kind === get('kind')) &&
        (!get('category') || x.category === get('category')) &&
        (!get('ownerId') || x.ownerId === get('ownerId')),
    );
    const cells: RiskHeatmapCell[] = [];
    for (let probability = 5; probability >= 1; probability--) {
      for (let impact = 1; impact <= 5; impact++) {
        const ids = open
          .filter((x) => x.probability === probability && x.impact === impact)
          .map((x) => x.id);
        cells.push({
          probability,
          impact,
          score: probability * impact,
          severity: severityOf(probability * impact),
          count: ids.length,
          riskIds: ids,
        });
      }
    }
    return r.json({ projectId: project.id, cells });
  }),

  http.get(`${API}/projects/:projectId/risks`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const get = (name: string) => url.searchParams.get(name) ?? undefined;
    const v = new Validator();
    v.oneOf('status', get('status'), RISK_STATUSES, false);
    v.oneOf('kind', get('kind'), RISK_KINDS, false);
    v.oneOf('category', get('category'), RISK_CATEGORIES, false);
    v.uuid('ownerId', get('ownerId'));
    const minScore = get('minScore') === undefined ? undefined : Number(get('minScore'));
    if (minScore !== undefined) v.number('minScore', minScore, 1, 25);
    const page = paging(url, RISK_SORT_FIELDS, 'score,desc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;

    const q = get('q')?.trim().toLowerCase() ?? '';
    const risks = db.state.risks
      .filter((x) => x.projectId === project.id)
      .filter((x) => !get('status') || x.status === get('status'))
      .filter((x) => !get('kind') || x.kind === get('kind'))
      .filter((x) => !get('category') || x.category === get('category'))
      .filter((x) => !get('ownerId') || x.ownerId === get('ownerId'))
      .filter((x) => minScore === undefined || x.probability * x.impact >= minScore)
      .map(toRisk)
      .filter((x) => !q || x.title.toLowerCase().includes(q) || x.key.toLowerCase().includes(q));
    return r.json(sortAndPage(risks, page, sortKeys));
  }),

  http.post(`${API}/projects/:projectId/risks`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    riskShape(v, body, true);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!participates(project, membership)) return r.problem(403, 'access.denied');
    const domain = new Validator();
    riskDomain(domain, body, project);
    if (!domain.ok) return domain.problem(r);

    const risk: RiskRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number:
        Math.max(
          0,
          ...db.state.risks.filter((x) => x.projectId === project.id).map((x) => x.number),
        ) + 1,
      title: '',
      category: body['category'] as RiskCategory,
      kind: body['kind'] as RiskKind,
      status: 'IDENTIFIED',
      probability: 1,
      impact: 1,
      identifiedById: membership.userId,
      createdAt: new Date().toISOString(),
      version: 1,
    };
    apply(risk, body);
    // The first assessment is recorded with the risk.
    record(risk, { ...body, note: 'First assessment' }, membership.userId);
    db.state.risks.push(risk);
    db.save();
    return r.json(toRisk(risk), 201, { Location: `/api/v1/risks/${risk.id}` });
  }),

  http.get(`${API}/risks`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const portfolioId = url.searchParams.get('portfolioId') ?? undefined;
    const v = new Validator();
    v.uuid('portfolioId', portfolioId);
    const minScore = Number(url.searchParams.get('minScore') ?? 15);
    v.number('minScore', minScore, 1, 25);
    const page = paging(url, RISK_SORT_FIELDS, 'score,desc', v);
    if (!v.ok) return v.problem(r);

    const projects = new Set(
      visibleProjects(membership)
        .filter((p) => !portfolioId || p.portfolioId === portfolioId)
        .map((p) => p.id),
    );
    const risks = db.state.risks
      .filter((x) => projects.has(x.projectId) && isOpenRisk(x))
      .filter((x) => x.probability * x.impact >= minScore)
      .map(toRisk);
    return r.json(sortAndPage(risks, page, sortKeys));
  }),

  http.get(`${API}/risks/:riskId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRisk(r, membership, params['riskId']);
    if (found instanceof Response) return found;
    return r.json(toRisk(found.risk));
  }),

  http.patch(`${API}/risks/:riskId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    riskShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const found = visibleRisk(r, membership, params['riskId']);
    if (found instanceof Response) return found;
    const { risk, project } = found;
    if (!canManageRisk(risk, project, membership)) return r.problem(403, 'access.denied');
    if (!isOpenRisk(risk)) return r.problem(409, 'risks.closed');
    const stale = checkVersion(r, sent, risk.version);
    if (stale) return stale;
    const domain = new Validator();
    riskDomain(domain, body, project, risk);
    if (!domain.ok) return domain.problem(r);

    apply(risk, body);
    risk.version += 1;
    db.save();
    return r.json(toRisk(risk));
  }),

  http.get(`${API}/risks/:riskId/assessments`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleRisk(r, membership, params['riskId']);
    if (found instanceof Response) return found;
    return r.json(
      db.state.riskAssessments
        .filter((a) => a.riskId === found.risk.id)
        .sort((a, b) => a.assessedAt.localeCompare(b.assessedAt))
        .map(toAssessment),
    );
  }),

  http.post(`${API}/risks/:riskId/assessments`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    assessmentShape(v, body);
    if (!v.ok) return v.problem(r);
    const found = visibleRisk(r, membership, params['riskId']);
    if (found instanceof Response) return found;
    const { risk, project } = found;
    if (!canManageRisk(risk, project, membership)) return r.problem(403, 'access.denied');
    if (!isOpenRisk(risk)) return r.problem(409, 'risks.closed');

    const assessment = record(risk, body, membership.userId);
    risk.version += 1;
    db.save();
    return r.json(toAssessment(assessment), 201);
  }),

  http.post(`${API}/risks/:riskId/close`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('note', body['note'], 1, 1000);
    if (!v.ok) return v.problem(r);
    const found = visibleRisk(r, membership, params['riskId']);
    if (found instanceof Response) return found;
    const { risk, project } = found;
    if (!canManageRisk(risk, project, membership)) return r.problem(403, 'access.denied');
    if (!isOpenRisk(risk)) return r.problem(409, 'risks.closed');

    risk.status = 'CLOSED';
    risk.closure = 'EXPIRED';
    risk.closureNote = String(body['note']).trim();
    risk.version += 1;
    db.save();
    return r.json(toRisk(risk));
  }),

  http.post(`${API}/risks/:riskId/materialize`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = (await readBody(request)) ?? {};
    const v = new Validator();
    if (body['title'] !== undefined) v.string('title', body['title'], 1, 200);
    v.oneOf('priority', body['priority'], ISSUE_PRIORITIES, false);
    v.uuid('ownerId', body['ownerId']);
    v.date('dueDate', body['dueDate']);
    if (!v.ok) return v.problem(r);
    const found = visibleRisk(r, membership, params['riskId']);
    if (found instanceof Response) return found;
    const { risk, project } = found;
    if (!canManageRisk(risk, project, membership)) return r.problem(403, 'access.denied');
    if (!isOpenRisk(risk)) return r.problem(409, 'risks.closed');
    const ownerId = (body['ownerId'] as string | undefined) ?? risk.ownerId;
    if (ownerId && !orgMember(project.organizationId, ownerId)) {
      const domain = new Validator();
      domain.add('ownerId', 'invalid', 'is not a member of this organization');
      return domain.problem(r);
    }

    const issue: IssueRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number:
        Math.max(
          0,
          ...db.state.issues.filter((i) => i.projectId === project.id).map((i) => i.number),
        ) + 1,
      title: typeof body['title'] === 'string' ? body['title'].trim() : risk.title,
      ...(risk.description ? { description: risk.description } : {}),
      type: 'OTHER',
      priority:
        (body['priority'] as IssuePriority | undefined) ??
        severityOf(risk.probability * risk.impact),
      status: 'OPEN',
      ...(ownerId ? { ownerId } : {}),
      raisedById: membership.userId,
      ...(typeof body['dueDate'] === 'string' ? { dueDate: body['dueDate'] } : {}),
      riskId: risk.id,
      createdAt: new Date().toISOString(),
      version: 1,
    };
    db.state.issues.push(issue);
    const view = toIssue(issue);
    risk.status = 'CLOSED';
    risk.closure = 'MATERIALIZED';
    risk.closureNote = `Materialized as ${view.key}`;
    risk.issueId = issue.id;
    risk.version += 1;
    db.save();
    return r.json(view, 201, { Location: `/api/v1/issues/${issue.id}` });
  }),
];
