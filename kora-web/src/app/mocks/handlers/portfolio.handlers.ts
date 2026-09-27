import { delay, http } from 'msw';
import { PORTFOLIO_SORT_FIELDS, Role } from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { PortfolioRecord, ProgramRecord } from '../data-projects';
import { db } from '../db';
import {
  API,
  Reply,
  Validator,
  authenticate,
  checkPathId,
  checkVersion,
  etag,
  ifMatchVersion,
  invalidBody,
  paging,
  readBody,
  reply,
  requireRole,
  sortAndPage,
  tenant,
} from '../http';
import { toPortfolio, toProgram } from '../projects-domain';

const GOVERNORS: Role[] = ['PMO', 'ORG_ADMIN'];
const MANAGERS: Role[] = ['PROJECT_MANAGER', 'PMO', 'ORG_ADMIN'];

/** The caller's membership in the active organization, or the 401/400/403 to return. */
export function caller(request: Request, r: Reply): MembershipRecord | Response {
  const userId = authenticate(request, r);
  if (userId instanceof Response) return userId;
  return tenant(request, r, userId);
}

/** A person referenced by id must be in the organization with one of `roles` (else 400 invalid). */
export function eligible(
  v: Validator,
  field: string,
  userId: unknown,
  organizationId: string,
  roles: readonly Role[],
): void {
  if (typeof userId !== 'string') return;
  const membership = db.membership(userId, organizationId);
  if (!membership || !roles.includes(membership.role)) {
    v.add(field, 'invalid', `must be a member with role ${roles.join(', ')}`);
  }
}

function portfolioIn(organizationId: string, id: unknown): PortfolioRecord | undefined {
  return db.state.portfolios.find((p) => p.id === id && p.organizationId === organizationId);
}

function portfolioShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0)
    v.add('body', 'required', 'send at least one field');
  if (creating || body['name'] !== undefined) v.string('name', body['name'], 2, 100);
  if (body['description'] !== undefined)
    v.string('description', body['description'], 0, 2000, false);
  v.textList('strategicObjectives', body['strategicObjectives']);
  v.uuid('ownerId', body['ownerId']);
  if (body['status'] !== undefined)
    v.oneOf('status', body['status'], ['ACTIVE', 'ARCHIVED'] as const);
}

function programShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0)
    v.add('body', 'required', 'send at least one field');
  if (creating || body['name'] !== undefined) v.string('name', body['name'], 2, 100);
  if (body['description'] !== undefined)
    v.string('description', body['description'], 0, 2000, false);
  v.uuid('managerId', body['managerId'], creating);
  if (body['status'] !== undefined)
    v.oneOf('status', body['status'], ['ACTIVE', 'CLOSED'] as const);
}

export const portfolioHandlers = [
  http.get(`${API}/portfolios`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;

    const url = new URL(request.url);
    const v = new Validator();
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    if (status !== null) v.oneOf('status', status, ['ACTIVE', 'ARCHIVED'] as const);
    if (q.length > 100) v.add('q', 'length', 'size must be at most 100', { max: 100 });
    const page = paging(url, PORTFOLIO_SORT_FIELDS, 'name,asc', v);
    if (!v.ok) return v.problem(r);

    const portfolios = db.state.portfolios
      .filter((p) => p.organizationId === membership.organizationId)
      .filter((p) => !status || p.status === status)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map(toPortfolio);
    return r.json(
      sortAndPage(portfolios, page, { name: (p) => p.name, createdAt: (p) => p.createdAt }),
    );
  }),

  http.post(`${API}/portfolios`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    portfolioShape(v, body, true);
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, GOVERNORS);
    if (denied) return denied;
    const domain = new Validator();
    eligible(domain, 'ownerId', body['ownerId'], membership.organizationId, GOVERNORS);
    if (!domain.ok) return domain.problem(r);

    const record: PortfolioRecord = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      name: String(body['name']).trim(),
      ...(body['description'] ? { description: String(body['description']) } : {}),
      strategicObjectives: (body['strategicObjectives'] as string[] | undefined) ?? [],
      ownerId: (body['ownerId'] as string | undefined) ?? membership.userId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      version: 1,
    };
    db.state.portfolios.push(record);
    db.save();
    return r.json(toPortfolio(record), 201, {
      ...etag(record.version),
      Location: `/api/v1/portfolios/${record.id}`,
    });
  }),

  http.get(`${API}/portfolios/:portfolioId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'portfolioId', params['portfolioId']);
    if (badId) return badId;
    const record = portfolioIn(membership.organizationId, params['portfolioId']);
    if (!record) return r.problem(404, 'resource.not_found');
    return r.json(toPortfolio(record), 200, etag(record.version));
  }),

  http.patch(`${API}/portfolios/:portfolioId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'portfolioId', params['portfolioId']);
    if (badId) return badId;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    portfolioShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, GOVERNORS);
    if (denied) return denied;
    const record = portfolioIn(membership.organizationId, params['portfolioId']);
    if (!record) return r.problem(404, 'resource.not_found');
    const stale = checkVersion(r, sent, record.version);
    if (stale) return stale;
    if (record.status === 'ARCHIVED' && body['status'] !== 'ACTIVE') {
      return r.problem(409, 'portfolios.archived');
    }
    const domain = new Validator();
    eligible(domain, 'ownerId', body['ownerId'], membership.organizationId, GOVERNORS);
    if (!domain.ok) return domain.problem(r);

    if (body['name'] !== undefined) record.name = String(body['name']).trim();
    if (body['description'] !== undefined) record.description = String(body['description']);
    if (body['strategicObjectives'] !== undefined) {
      record.strategicObjectives = body['strategicObjectives'] as string[];
    }
    if (body['ownerId'] !== undefined) record.ownerId = String(body['ownerId']);
    if (body['status'] !== undefined) record.status = body['status'] as PortfolioRecord['status'];
    record.version += 1;
    db.save();
    return r.json(toPortfolio(record), 200, etag(record.version));
  }),

  http.delete(`${API}/portfolios/:portfolioId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'portfolioId', params['portfolioId']);
    if (badId) return badId;
    const denied = requireRole(r, membership.role, GOVERNORS);
    if (denied) return denied;
    const record = portfolioIn(membership.organizationId, params['portfolioId']);
    if (!record) return r.problem(404, 'resource.not_found');
    const used =
      db.state.programs.some((p) => p.portfolioId === record.id) ||
      db.state.projects.some((p) => p.portfolioId === record.id);
    if (used) return r.problem(409, 'portfolios.not_empty');
    db.state.portfolios = db.state.portfolios.filter((p) => p !== record);
    db.save();
    return r.empty(204);
  }),

  http.get(`${API}/portfolios/:portfolioId/programs`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'portfolioId', params['portfolioId']);
    if (badId) return badId;
    const portfolio = portfolioIn(membership.organizationId, params['portfolioId']);
    if (!portfolio) return r.problem(404, 'resource.not_found');
    return r.json(
      db.state.programs
        .filter((p) => p.portfolioId === portfolio.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toProgram),
    );
  }),

  http.post(`${API}/portfolios/:portfolioId/programs`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'portfolioId', params['portfolioId']);
    if (badId) return badId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    programShape(v, body, true);
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, GOVERNORS);
    if (denied) return denied;
    const portfolio = portfolioIn(membership.organizationId, params['portfolioId']);
    if (!portfolio) return r.problem(404, 'resource.not_found');
    if (portfolio.status === 'ARCHIVED') return r.problem(409, 'portfolios.archived');
    const domain = new Validator();
    eligible(domain, 'managerId', body['managerId'], membership.organizationId, MANAGERS);
    if (!domain.ok) return domain.problem(r);

    const record: ProgramRecord = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      portfolioId: portfolio.id,
      name: String(body['name']).trim(),
      ...(body['description'] ? { description: String(body['description']) } : {}),
      managerId: String(body['managerId']),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      version: 1,
    };
    db.state.programs.push(record);
    db.save();
    return r.json(toProgram(record), 201, {
      ...etag(record.version),
      Location: `/api/v1/programs/${record.id}`,
    });
  }),

  http.get(`${API}/programs/:programId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'programId', params['programId']);
    if (badId) return badId;
    const record = db.state.programs.find(
      (p) => p.id === params['programId'] && p.organizationId === membership.organizationId,
    );
    if (!record) return r.problem(404, 'resource.not_found');
    return r.json(toProgram(record), 200, etag(record.version));
  }),

  http.patch(`${API}/programs/:programId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'programId', params['programId']);
    if (badId) return badId;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    programShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, GOVERNORS);
    if (denied) return denied;
    const record = db.state.programs.find(
      (p) => p.id === params['programId'] && p.organizationId === membership.organizationId,
    );
    if (!record) return r.problem(404, 'resource.not_found');
    const stale = checkVersion(r, sent, record.version);
    if (stale) return stale;
    if (portfolioIn(membership.organizationId, record.portfolioId)?.status === 'ARCHIVED') {
      return r.problem(409, 'portfolios.archived');
    }
    const domain = new Validator();
    eligible(domain, 'managerId', body['managerId'], membership.organizationId, MANAGERS);
    if (!domain.ok) return domain.problem(r);

    if (body['name'] !== undefined) record.name = String(body['name']).trim();
    if (body['description'] !== undefined) record.description = String(body['description']);
    if (body['managerId'] !== undefined) record.managerId = String(body['managerId']);
    if (body['status'] !== undefined) record.status = body['status'] as ProgramRecord['status'];
    record.version += 1;
    db.save();
    return r.json(toProgram(record), 200, etag(record.version));
  }),
];
