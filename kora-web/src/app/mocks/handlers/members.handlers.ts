import { delay, http } from 'msw';
import { MEMBER_SORT_FIELDS, ROLES, Role } from '../../core/api/api.models';
import { db } from '../db';
import {
  API,
  Validator,
  authenticate,
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

export const membersHandlers = [
  http.get(`${API}/members`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;

    const url = new URL(request.url);
    const v = new Validator();
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const role = url.searchParams.get('role');
    if (q.length > 100) v.add('q', 'length', 'size must be at most 100', { max: 100 });
    if (role !== null) v.oneOf('role', role, ROLES);
    const page = paging(url, MEMBER_SORT_FIELDS, 'fullName,asc', v);
    if (!v.ok) return v.problem(r);

    const members = db.state.memberships
      .filter((m) => m.organizationId === membership.organizationId)
      .map((m) => db.member(m))
      .filter((m) => !role || m.role === role)
      .filter(
        (m) => !q || m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );

    return r.json(
      sortAndPage(members, page, {
        fullName: (m) => m.fullName,
        email: (m) => m.email,
        role: (m) => ROLES.indexOf(m.role),
        joinedAt: (m) => m.joinedAt,
      }),
    );
  }),

  http.patch(`${API}/members/:memberId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;
    const sentVersion = ifMatchVersion(request, r);
    if (sentVersion instanceof Response) return sentVersion;

    // Body shape comes before the role check (see the check order in ../http.ts).
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('role', body['role'], ROLES);
    if (!v.ok) return v.problem(r);

    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;

    // Another organization's member id is indistinguishable from an unknown one: 404, never 403.
    const target = db.state.memberships.find(
      (m) => m.id === params['memberId'] && m.organizationId === membership.organizationId,
    );
    if (!target) return r.problem(404, 'resource.not_found');
    const stale = checkVersion(r, sentVersion, target.version);
    if (stale) return stale;

    const role = body['role'] as Role;
    const admins = db.state.memberships.filter(
      (m) => m.organizationId === membership.organizationId && m.role === 'ORG_ADMIN',
    );
    if (target.role === 'ORG_ADMIN' && role !== 'ORG_ADMIN' && admins.length === 1) {
      return r.problem(409, 'members.last_admin');
    }
    target.role = role;
    target.version += 1;
    db.save();
    return r.json(db.member(target), 200, etag(target.version));
  }),

  http.delete(`${API}/members/:memberId`, async ({ request, params }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;

    const target = db.state.memberships.find(
      (m) => m.id === params['memberId'] && m.organizationId === membership.organizationId,
    );
    if (!target) return r.problem(404, 'resource.not_found');
    if (target.userId === userId) return r.problem(409, 'members.self_removal');

    db.state.memberships = db.state.memberships.filter((m) => m !== target);
    db.save();
    return r.empty(204);
  }),
];
