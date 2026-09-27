import { http } from 'msw';
import {
  HEALTHS,
  METHODOLOGIES,
  Methodology,
  Money,
  PROJECT_SORT_FIELDS,
  PROJECT_STATUSES,
  ProjectStatus,
  Role,
  TRANSITIONS_NEEDING_REASON,
} from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { CharterRecord, ProjectRecord } from '../data-projects';
import { db, must } from '../db';
import { currencyDigits } from '../decimal';
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
import {
  canEdit,
  canSee,
  orgCurrency,
  projectMembers,
  TRANSITIONS,
  toProject,
  visibleProjects,
} from '../projects-domain';
import { caller, eligible } from './portfolio.handlers';

const CREATORS: Role[] = ['PROJECT_MANAGER', 'PMO', 'ORG_ADMIN'];

/**
 * The project named in the path, if the caller may see it: another tenant's or an invisible
 * project is 404 (never 403), so its existence doesn't leak.
 */
export function visibleProject(
  r: Reply,
  membership: MembershipRecord,
  projectId: unknown,
): ProjectRecord | Response {
  const badId = checkPathId(r, 'projectId', projectId);
  if (badId) return badId;
  const project = db.state.projects.find((p) => p.id === projectId);
  return project && canSee(project, membership) ? project : r.problem(404, 'resource.not_found');
}

export function requireEditor(
  r: Reply,
  project: ProjectRecord,
  membership: MembershipRecord,
): Response | null {
  return canEdit(project, membership) ? null : r.problem(403, 'access.denied');
}

function projectShape(
  v: Validator,
  body: Record<string, unknown>,
  creating: boolean,
  currency: string,
) {
  if (!creating && Object.keys(body).length === 0)
    v.add('body', 'required', 'send at least one field');
  if (creating) {
    v.pattern('code', body['code'], /^[A-Z][A-Z0-9-]{1,14}$/, true);
    v.uuid('portfolioId', body['portfolioId'], true);
  }
  if (creating || body['name'] !== undefined) v.string('name', body['name'], 2, 150);
  if (body['description'] !== undefined)
    v.string('description', body['description'], 0, 4000, false);
  v.uuid('programId', body['programId']);
  v.uuid('managerId', body['managerId']);
  if (creating || body['methodology'] !== undefined)
    v.oneOf('methodology', body['methodology'], METHODOLOGIES);
  v.date('startDate', body['startDate'], creating);
  v.date('targetEndDate', body['targetEndDate'], creating);
  v.money('budget', body['budget'], currency, currencyDigits(currency));
}

function checkDates(v: Validator, start: string, end: string): void {
  if (end <= start) v.add('targetEndDate', 'invalid', 'must be after startDate');
}

export const projectHandlers = [
  http.get(`${API}/projects`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;

    const url = new URL(request.url);
    const get = (name: string) => url.searchParams.get(name);
    const v = new Validator();
    v.uuid('portfolioId', get('portfolioId') ?? undefined);
    v.uuid('programId', get('programId') ?? undefined);
    if (get('status') !== null) v.oneOf('status', get('status'), PROJECT_STATUSES);
    if (get('methodology') !== null) v.oneOf('methodology', get('methodology'), METHODOLOGIES);
    if (get('health') !== null) v.oneOf('health', get('health'), HEALTHS);
    const q = get('q')?.trim().toLowerCase() ?? '';
    if (q.length > 100) v.add('q', 'length', 'size must be at most 100', { max: 100 });
    const page = paging(url, PROJECT_SORT_FIELDS, 'code,asc', v);
    if (!v.ok) return v.problem(r);

    const projects = visibleProjects(membership)
      .filter((p) => !get('portfolioId') || p.portfolioId === get('portfolioId'))
      .filter((p) => !get('programId') || p.programId === get('programId'))
      .filter((p) => !get('status') || p.status === get('status'))
      .filter((p) => !get('methodology') || p.methodology === get('methodology'))
      .map(toProject)
      .filter((p) => !get('health') || p.health === get('health'))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    return r.json(
      sortAndPage(projects, page, {
        code: (p) => p.code,
        name: (p) => p.name,
        status: (p) => PROJECT_STATUSES.indexOf(p.status),
        startDate: (p) => p.startDate,
        targetEndDate: (p) => p.targetEndDate,
      }),
    );
  }),

  http.post(`${API}/projects`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const currency = orgCurrency(membership.organizationId);
    const v = new Validator();
    projectShape(v, body, true, currency);
    if (v.ok) checkDates(v, String(body['startDate']), String(body['targetEndDate']));
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, CREATORS);
    if (denied) return denied;

    const domain = new Validator();
    const portfolio = db.state.portfolios.find(
      (p) => p.id === body['portfolioId'] && p.organizationId === membership.organizationId,
    );
    if (!portfolio) domain.add('portfolioId', 'invalid', 'no such portfolio');
    if (body['programId'] !== undefined) {
      const program = db.state.programs.find((p) => p.id === body['programId']);
      if (!program || program.portfolioId !== body['portfolioId']) {
        domain.add('programId', 'invalid', 'must belong to the portfolio');
      }
    }
    eligible(domain, 'managerId', body['managerId'], membership.organizationId, CREATORS);
    if (!domain.ok) return domain.problem(r);
    if (portfolio?.status === 'ARCHIVED') return r.problem(409, 'portfolios.archived');
    const code = String(body['code']);
    if (
      db.state.projects.some(
        (p) => p.organizationId === membership.organizationId && p.code === code,
      )
    ) {
      return r.problem(409, 'projects.code_taken', {
        errors: [{ field: 'code', code: 'projects.code_taken', message: 'code already used' }],
      });
    }

    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      code,
      name: String(body['name']).trim(),
      ...(body['description'] ? { description: String(body['description']) } : {}),
      portfolioId: String(body['portfolioId']),
      ...(body['programId'] ? { programId: String(body['programId']) } : {}),
      managerId: (body['managerId'] as string | undefined) ?? membership.userId,
      methodology: body['methodology'] as ProjectRecord['methodology'],
      status: 'PROPOSED',
      startDate: String(body['startDate']),
      targetEndDate: String(body['targetEndDate']),
      ...(body['budget'] ? { budget: body['budget'] as ProjectRecord['budget'] } : {}),
      createdAt: now,
      version: 1,
    };
    const charter: CharterRecord = {
      projectId: record.id,
      versionNumber: 1,
      status: 'DRAFT',
      objectives: [],
      inScope: [],
      outOfScope: [],
      assumptions: [],
      constraints: [],
      highLevelRisks: [],
      milestones: [],
      version: 1,
    };
    db.state.projects.push(record);
    db.state.charters.push(charter);
    db.save();
    return r.json(toProject(record), 201, {
      ...etag(record.version),
      Location: `/api/v1/projects/${record.id}`,
    });
  }),

  http.get(`${API}/projects/:projectId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(toProject(project), 200, etag(project.version));
  }),

  http.patch(`${API}/projects/:projectId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'projectId', params['projectId']);
    if (badId) return badId;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    projectShape(v, body, false, orgCurrency(membership.organizationId));
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    const stale = checkVersion(r, sent, project.version);
    if (stale) return stale;

    const domain = new Validator();
    checkDates(
      domain,
      (body['startDate'] as string | undefined) ?? project.startDate,
      (body['targetEndDate'] as string | undefined) ?? project.targetEndDate,
    );
    if (body['programId'] !== undefined) {
      const program = db.state.programs.find((p) => p.id === body['programId']);
      if (!program || program.portfolioId !== project.portfolioId) {
        domain.add('programId', 'invalid', 'must belong to the portfolio');
      }
    }
    eligible(domain, 'managerId', body['managerId'], membership.organizationId, CREATORS);
    if (!domain.ok) return domain.problem(r);
    if (db.state.portfolios.find((p) => p.id === project.portfolioId)?.status === 'ARCHIVED') {
      return r.problem(409, 'portfolios.archived');
    }
    if (
      body['methodology'] !== undefined &&
      body['methodology'] !== project.methodology &&
      project.status !== 'PROPOSED'
    ) {
      return r.problem(409, 'projects.methodology_locked');
    }

    if (body['name'] !== undefined) project.name = String(body['name']).trim();
    if (body['description'] !== undefined) project.description = String(body['description']);
    if (body['programId'] !== undefined) project.programId = String(body['programId']);
    if (body['managerId'] !== undefined) project.managerId = String(body['managerId']);
    if (body['methodology'] !== undefined) project.methodology = body['methodology'] as Methodology;
    if (body['startDate'] !== undefined) project.startDate = String(body['startDate']);
    if (body['targetEndDate'] !== undefined) project.targetEndDate = String(body['targetEndDate']);
    if (body['budget'] !== undefined) project.budget = body['budget'] as Money;
    project.version += 1;
    db.save();
    return r.json(toProject(project), 200, etag(project.version));
  }),

  http.post(`${API}/projects/:projectId/transitions`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('to', body['to'], PROJECT_STATUSES);
    if (body['reason'] !== undefined) v.string('reason', body['reason'], 0, 500, false);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;

    const to = body['to'] as ProjectStatus;
    if (project.status === 'PROPOSED' && to === 'APPROVED') {
      return r.problem(409, 'projects.charter_approval_required');
    }
    if (!TRANSITIONS[project.status].includes(to))
      return r.problem(409, 'projects.invalid_transition');
    const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
    if (TRANSITIONS_NEEDING_REASON.includes(to) && !reason) {
      const needs = new Validator();
      needs.add('reason', 'required', `a reason is required to move to ${to}`);
      return needs.problem(r, 422);
    }
    project.status = to;
    project.version += 1;
    db.save();
    return r.json(toProject(project), 200, etag(project.version));
  }),

  http.put(`${API}/projects/:projectId/health-override`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('health', body['health'], ['GREEN', 'AMBER', 'RED'] as const);
    v.string('reason', body['reason'], 1, 500);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    project.healthOverride = {
      health: body['health'] as 'GREEN' | 'AMBER' | 'RED',
      reason: String(body['reason']).trim(),
    };
    project.version += 1;
    db.save();
    return r.json(toProject(project), 200, etag(project.version));
  }),

  http.delete(`${API}/projects/:projectId/health-override`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    delete project.healthOverride;
    project.version += 1;
    db.save();
    return r.json(toProject(project), 200, etag(project.version));
  }),

  http.get(`${API}/projects/:projectId/members`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(projectMembers(project));
  }),

  http.put(`${API}/projects/:projectId/members/:userId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badUser = checkPathId(r, 'userId', params['userId']);
    if (badUser) return badUser;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('projectRole', body['projectRole'], ['CONTRIBUTOR', 'OBSERVER'] as const);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    const userId = String(params['userId']);
    if (!db.membership(userId, project.organizationId)) return r.problem(404, 'resource.not_found');
    if (userId !== project.managerId) {
      const existing = db.state.projectMembers.find(
        (m) => m.projectId === project.id && m.userId === userId,
      );
      const projectRole = body['projectRole'] as 'CONTRIBUTOR' | 'OBSERVER';
      if (existing) existing.projectRole = projectRole;
      else
        db.state.projectMembers.push({
          projectId: project.id,
          userId,
          projectRole,
          addedAt: new Date().toISOString(),
        });
      db.save();
    }
    return r.json(
      must(
        projectMembers(project).find((m) => m.userId === userId),
        'member',
      ),
    );
  }),

  http.delete(`${API}/projects/:projectId/members/:userId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badUser = checkPathId(r, 'userId', params['userId']);
    if (badUser) return badUser;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    if (params['userId'] === project.managerId) return r.problem(409, 'project_members.is_manager');
    const before = db.state.projectMembers.length;
    db.state.projectMembers = db.state.projectMembers.filter(
      (m) => !(m.projectId === project.id && m.userId === params['userId']),
    );
    if (db.state.projectMembers.length === before) return r.problem(404, 'resource.not_found');
    db.save();
    return r.empty(204);
  }),
];
