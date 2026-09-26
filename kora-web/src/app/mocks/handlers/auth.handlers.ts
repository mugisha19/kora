import { delay, http } from 'msw';
import { db, must } from '../db';
import {
  API,
  REFRESH_COOKIE,
  Validator,
  clearedRefreshCookie,
  invalidBody,
  isTimeZone,
  readBody,
  reply,
  sessionResponse,
} from '../http';

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60_000;

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const body = await readBody(request);
    if (!body) return invalidBody(r);

    const v = new Validator();
    v.email('email', body['email']);
    v.string('password', body['password'], 1, 128);
    if (!v.ok) return v.problem(r);

    const email = String(body['email']).toLowerCase();
    const now = Date.now();
    const failures = (db.state.loginFailures[email] ?? []).filter(
      (t) => now - t < FAILURE_WINDOW_MS,
    );
    if (failures.length >= MAX_FAILURES) {
      const wait = Math.ceil((failures[0] + FAILURE_WINDOW_MS - now) / 1000);
      return r.problem(429, 'rate_limited', { headers: { 'Retry-After': String(wait) } });
    }

    const user = db.userByEmail(email);
    if (!user || user.password !== body['password']) {
      db.state.loginFailures[email] = [...failures, now];
      db.save();
      // Same response for an unknown email and a wrong password.
      return r.problem(401, 'auth.invalid_credentials');
    }
    db.state.loginFailures[email] = [];
    return sessionResponse(r, user.id);
  }),

  http.post(`${API}/auth/refresh`, async ({ request, cookies }) => {
    await delay();
    const r = reply(request);
    const presented = db.state.refreshTokens.find((t) => t.token === cookies[REFRESH_COOKIE]);
    if (!presented || presented.status === 'revoked') {
      return r.problem(401, 'auth.refresh_invalid', {
        headers: { 'Set-Cookie': clearedRefreshCookie() },
      });
    }
    if (presented.status === 'rotated') {
      // A rotated token came back: it was copied. Revoke the whole family.
      for (const token of db.state.refreshTokens) {
        if (token.familyId === presented.familyId) token.status = 'revoked';
      }
      db.save();
      return r.problem(401, 'auth.refresh_invalid', {
        headers: { 'Set-Cookie': clearedRefreshCookie() },
      });
    }
    presented.status = 'rotated';
    return sessionResponse(r, presented.userId, 200, presented.familyId);
  }),

  http.post(`${API}/auth/logout`, async ({ request, cookies }) => {
    await delay();
    const presented = db.state.refreshTokens.find((t) => t.token === cookies[REFRESH_COOKIE]);
    if (presented) {
      for (const token of db.state.refreshTokens) {
        if (token.familyId === presented.familyId) token.status = 'revoked';
      }
      db.save();
    }
    return reply(request).empty(204, { 'Set-Cookie': clearedRefreshCookie() });
  }),

  http.post(`${API}/auth/register-organization`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const body = await readBody(request);
    if (!body) return invalidBody(r);

    const v = new Validator();
    v.string('organizationName', body['organizationName'], 2, 100);
    v.string('fullName', body['fullName'], 1, 120);
    v.email('email', body['email']);
    v.newPassword('password', body['password']);
    v.pattern('currency', body['currency'], /^[A-Z]{3}$/);
    const timeZone = body['timeZone'];
    if (timeZone !== undefined && (typeof timeZone !== 'string' || !isTimeZone(timeZone))) {
      v.add('timeZone', 'invalid', 'must be an IANA time zone id');
    }
    if (!v.ok) return v.problem(r);

    const email = String(body['email']).trim();
    if (db.userByEmail(email)) {
      return r.problem(409, 'auth.email_taken', {
        errors: [{ field: 'email', code: 'auth.email_taken', message: 'email already registered' }],
      });
    }

    const name = String(body['organizationName']).trim();
    let slug = slugify(name) || 'organization';
    for (let n = 2; db.state.organizations.some((o) => o.slug === slug); n++) {
      slug = `${slugify(name)}-${n}`;
    }
    const now = new Date().toISOString();
    const organizationId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    db.state.organizations.push({
      id: organizationId,
      name,
      slug,
      currency: (body['currency'] as string | undefined) ?? 'RWF',
      timeZone: (timeZone as string | undefined) ?? 'Africa/Kigali',
      createdAt: now,
      version: 1,
    });
    db.state.users.push({
      id: userId,
      email,
      fullName: String(body['fullName']).trim(),
      locale: 'en',
      password: String(body['password']),
    });
    db.state.memberships.push({
      id: crypto.randomUUID(),
      userId,
      organizationId,
      role: 'ORG_ADMIN',
      joinedAt: now,
      version: 1,
    });
    db.save();
    return sessionResponse(r, userId, 201);
  }),

  http.post(`${API}/auth/password/forgot`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.email('email', body['email']);
    if (!v.ok) return v.problem(r);

    const user = db.userByEmail(String(body['email']));
    if (user) {
      const token = `reset-${crypto.randomUUID()}`;
      db.state.resetTokens.push({
        token,
        userId: user.id,
        expiresAt: Date.now() + 3_600_000,
        used: false,
      });
      db.save();
      // Stands in for the email the API sends (Mailpit locally).
      console.info(
        `[mock api] Password reset link for ${user.email}: /reset-password?token=${token}`,
      );
    }
    // Always 202, so accounts can't be discovered.
    return r.empty(202);
  }),

  http.post(`${API}/auth/password/reset`, async ({ request }) => {
    await delay();
    const r = reply(request);
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('token', body['token'], 20, 200);
    v.newPassword('newPassword', body['newPassword']);
    if (!v.ok) return v.problem(r);

    const record = db.state.resetTokens.find((t) => t.token === body['token']);
    if (!record || record.used || record.expiresAt < Date.now()) {
      return r.problem(410, 'auth.reset_token_invalid');
    }
    record.used = true;
    const user = must(db.user(record.userId), 'user');
    user.password = String(body['newPassword']);
    // Signs the user out everywhere.
    for (const token of db.state.refreshTokens) {
      if (token.userId === user.id) token.status = 'revoked';
    }
    db.save();
    return r.empty(204);
  }),
];
