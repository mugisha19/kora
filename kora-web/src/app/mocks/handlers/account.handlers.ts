import { delay, http } from 'msw';
import { LOCALES } from '../../core/api/api.models';
import { db, must } from '../db';
import {
  API,
  Validator,
  authenticate,
  checkIfMatch,
  etag,
  invalidBody,
  isTimeZone,
  readBody,
  reply,
  requireRole,
  tenant,
} from '../http';

/** `/me` (not tenant-scoped) and `/organization` (the active organization). */
export const accountHandlers = [
  http.get(`${API}/me`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    return r.json(db.me(userId));
  }),

  http.patch(`${API}/me`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);

    const v = new Validator();
    if (body['fullName'] === undefined && body['locale'] === undefined) {
      v.add('body', 'required', 'send at least one of fullName, locale');
    }
    if (body['fullName'] !== undefined) v.string('fullName', body['fullName'], 1, 120);
    if (body['locale'] !== undefined) v.oneOf('locale', body['locale'], LOCALES);
    if (!v.ok) return v.problem(r);

    const user = must(db.user(userId), 'user');
    if (body['fullName'] !== undefined) user.fullName = String(body['fullName']).trim();
    if (body['locale'] !== undefined) user.locale = body['locale'] as (typeof LOCALES)[number];
    db.save();
    return r.json(db.me(userId));
  }),

  http.get(`${API}/organization`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;
    const organization = must(db.organization(membership.organizationId), 'organization');
    return r.json(organization, 200, etag(organization.version));
  }),

  http.patch(`${API}/organization`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;

    const organization = must(db.organization(membership.organizationId), 'organization');
    const precondition = checkIfMatch(request, r, organization.version);
    if (precondition) return precondition;

    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    if (['name', 'currency', 'timeZone'].every((key) => body[key] === undefined)) {
      v.add('body', 'required', 'send at least one of name, currency, timeZone');
    }
    if (body['name'] !== undefined) v.string('name', body['name'], 2, 100);
    v.pattern('currency', body['currency'], /^[A-Z]{3}$/);
    const timeZone = body['timeZone'];
    if (timeZone !== undefined && (typeof timeZone !== 'string' || !isTimeZone(timeZone))) {
      v.add('timeZone', 'invalid', 'must be an IANA time zone id');
    }
    if (!v.ok) return v.problem(r);

    if (body['name'] !== undefined) organization.name = String(body['name']).trim();
    if (body['currency'] !== undefined) organization.currency = String(body['currency']);
    if (timeZone !== undefined) organization.timeZone = String(timeZone);
    organization.version += 1;
    db.save();
    return r.json(organization, 200, etag(organization.version));
  }),
];
