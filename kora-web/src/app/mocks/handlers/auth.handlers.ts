import { http } from 'msw';
import { db, must } from '../db';
import {
  API,
  REFRESH_COOKIE,
  Validator,
  clearedRefreshCookie,
  invalidBody,
  isTimeZone,
  latency,
  readBody,
  reply,
  sessionResponse,
} from '../http';

/** Like the API: a token bucket per email, 10 attempts per 15 minutes, refilled gradually. */
const LOGIN_BUCKET_CAPACITY = 10;
const LOGIN_REFILL_MS = (15 * 60_000) / LOGIN_BUCKET_CAPACITY;

/** Rotated refresh token reused within this window: a two-tab race (401), not theft (revoke). */
const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Takes one sign-in attempt from the email's bucket. Every attempt counts, successful ones too, so
 * a known-good login can't be interleaved to reset the limit. Returns 0 when allowed, otherwise
 * the seconds until the next attempt is allowed (the `Retry-After`).
 */
function takeLoginAttempt(email: string, now: number): number {
  const bucket = db.state.loginBuckets[email] ?? { tokens: LOGIN_BUCKET_CAPACITY, updatedAt: now };
  const tokens = Math.min(
    LOGIN_BUCKET_CAPACITY,
    bucket.tokens + (now - bucket.updatedAt) / LOGIN_REFILL_MS,
  );
  if (tokens < 1) {
    db.state.loginBuckets[email] = { tokens, updatedAt: now };
    db.save();
    return Math.max(1, Math.ceil(((1 - tokens) * LOGIN_REFILL_MS) / 1000));
  }
  db.state.loginBuckets[email] = { tokens: tokens - 1, updatedAt: now };
  db.save();
  return 0;
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Drop the combining accents NFKD split off (é → e).
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const body = await readBody(request);
    if (!body) return invalidBody(r);

    const v = new Validator();
    v.email('email', body['email']);
    v.string('password', body['password'], 1, 128);
    if (!v.ok) return v.problem(r);

    const email = String(body['email']).toLowerCase();
    const wait = takeLoginAttempt(email, Date.now());
    if (wait > 0) {
      return r.problem(429, 'rate_limited', { headers: { 'Retry-After': String(wait) } });
    }

    const user = db.userByEmail(email);
    if (!user || user.password !== body['password']) {
      // Same response for an unknown email and a wrong password.
      return r.problem(401, 'auth.invalid_credentials');
    }
    return sessionResponse(r, user.id);
  }),

  http.post(`${API}/auth/refresh`, async ({ request, cookies }) => {
    await latency();
    const r = reply(request);
    const presented = db.state.refreshTokens.find((t) => t.token === cookies[REFRESH_COOKIE]);
    if (!presented || presented.status === 'revoked') {
      return r.problem(401, 'auth.refresh_invalid', {
        headers: { 'Set-Cookie': clearedRefreshCookie() },
      });
    }
    if (presented.status === 'rotated') {
      if (Date.now() - (presented.rotatedAt ?? 0) <= REFRESH_REUSE_GRACE_MS) {
        // Another tab won the race; its new cookie is already in the shared jar. Plain 401: the
        // client retries shortly and succeeds. Keep the cookie, it may already be the new one.
        return r.problem(401, 'auth.refresh_invalid');
      }
      // A rotated token came back later: it was copied. Revoke the whole family.
      for (const token of db.state.refreshTokens) {
        if (token.familyId === presented.familyId) token.status = 'revoked';
      }
      db.save();
      return r.problem(401, 'auth.refresh_invalid', {
        headers: { 'Set-Cookie': clearedRefreshCookie() },
      });
    }
    presented.status = 'rotated';
    presented.rotatedAt = Date.now();
    return sessionResponse(r, presented.userId, 200, presented.familyId);
  }),

  http.post(`${API}/auth/logout`, async ({ request, cookies }) => {
    await latency();
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
    await latency();
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
    await latency();
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
    await latency();
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
