import { DEMO_INVITATION_TOKENS, DEMO_PASSWORD, ORG_AKAGERA, ORG_VIRUNGA } from './data';
import { db } from './db';
import { call, signIn } from '../../testing/mock-requests';

/**
 * The mock API must behave like the contract says, or screens built against it will break on the
 * real API. These tests run requests through the MSW handlers directly (no service worker).
 */
describe('mock API', () => {
  beforeEach(() => db.reset());

  describe('conventions', () => {
    it('answers unknown paths with 401 when signed out (security runs first)', async () => {
      const res = await call('GET', '/nowhere');

      expect(res.status).toBe(401);
      expect(res.body!['code']).toBe('auth.unauthenticated');
    });

    it('echoes a valid correlation id and answers unknown paths with a 404 problem', async () => {
      const { headers } = await signIn();
      const res = await call('GET', '/nowhere', {
        headers: { Authorization: headers().Authorization, 'X-Correlation-Id': 'abc-123' },
      });

      expect(res.status).toBe(404);
      expect(res.headers.get('X-Correlation-Id')).toBe('abc-123');
      expect(res.headers.get('Content-Type')).toContain('application/problem+json');
      expect(res.body).toMatchObject({
        type: 'urn:kora:problem:resource.not_found',
        code: 'resource.not_found',
        correlationId: 'abc-123',
        instance: '/api/v1/nowhere',
      });
    });

    it('replaces an invalid correlation id with a generated one', async () => {
      const res = await call('GET', '/nowhere', { headers: { 'X-Correlation-Id': 'not valid!' } });

      expect(res.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects a non-object body', async () => {
      const res = await call('POST', '/auth/login', { body: [1, 2] });

      expect(res.body!['errors']).toEqual([
        { field: 'body', code: 'invalid', message: expect.any(String) },
      ]);
    });
  });

  describe('auth', () => {
    it('signs in, returning a session and a refresh cookie', async () => {
      const res = await call('POST', '/auth/login', {
        body: { email: 'ADMIN@kora.demo', password: DEMO_PASSWORD },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(res.body!['user'].memberships).toHaveLength(2);
      expect(res.headers.get('Set-Cookie')).toMatch(/^kora_refresh=[^;]+; Max-Age=\d+/);
    });

    it('gives the same answer for an unknown email and a wrong password, then rate-limits', async () => {
      const unknown = await call('POST', '/auth/login', {
        body: { email: 'x@y.co', password: 'nope' },
      });
      expect(unknown.body!['code']).toBe('auth.invalid_credentials');

      // 10 attempts per 15 minutes; every attempt counts, a success doesn't reset the bucket.
      for (let i = 0; i < 9; i++) {
        const wrong = await call('POST', '/auth/login', {
          body: { email: 'pm@kora.demo', password: 'nope' },
        });
        expect(wrong.status).toBe(401);
      }
      const tenth = await call('POST', '/auth/login', {
        body: { email: 'pm@kora.demo', password: DEMO_PASSWORD },
      });
      expect(tenth.status).toBe(200);
      const limited = await call('POST', '/auth/login', {
        body: { email: 'pm@kora.demo', password: DEMO_PASSWORD },
      });
      expect(limited.status).toBe(429);
      expect(limited.body!['code']).toBe('rate_limited');
      expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    });

    it('refills the sign-in bucket gradually', async () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      for (let i = 0; i < 10; i++) {
        await call('POST', '/auth/login', { body: { email: 'pm@kora.demo', password: 'nope' } });
      }
      const limited = await call('POST', '/auth/login', {
        body: { email: 'pm@kora.demo', password: 'nope' },
      });
      expect(limited.headers.get('Retry-After')).toBe('90');

      now.mockReturnValue(1_000_000 + 90_000);
      const allowed = await call('POST', '/auth/login', {
        body: { email: 'pm@kora.demo', password: DEMO_PASSWORD },
      });
      expect(allowed.status).toBe(200);
      now.mockRestore();
    });

    it('validates with field-agnostic codes', async () => {
      const res = await call('POST', '/auth/login', { body: { email: 'nope' } });

      expect(res.status).toBe(400);
      expect(res.body!['errors']).toEqual([
        expect.objectContaining({ field: 'email', code: 'email' }),
        expect.objectContaining({ field: 'password', code: 'required' }),
      ]);
    });

    it('rotates refresh tokens and revokes the family when a rotated one is reused later', async () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(5_000_000);
      const { cookie } = await signIn();

      const first = await call('POST', '/auth/refresh', { headers: { Cookie: cookie } });
      expect(first.status).toBe(200);
      const next = String(first.headers.get('Set-Cookie')).split(';')[0];

      // Past the 10 s race window, reuse of the old token means it was copied.
      now.mockReturnValue(5_000_000 + 11_000);
      const reuse = await call('POST', '/auth/refresh', { headers: { Cookie: cookie } });
      expect(reuse.body!['code']).toBe('auth.refresh_invalid');
      expect(reuse.headers.get('Set-Cookie')).toContain('Max-Age=0');
      const afterTheft = await call('POST', '/auth/refresh', { headers: { Cookie: next } });
      expect(afterTheft.status).toBe(401);
      now.mockRestore();
    });

    it('treats a rotated token reused within 10 s as a two-tab race, not theft', async () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(5_000_000);
      const { cookie } = await signIn();

      const winner = await call('POST', '/auth/refresh', { headers: { Cookie: cookie } });
      const winnerCookie = String(winner.headers.get('Set-Cookie')).split(';')[0];
      now.mockReturnValue(5_000_000 + 2_000);
      const loser = await call('POST', '/auth/refresh', { headers: { Cookie: cookie } });

      expect(loser.status).toBe(401);
      expect(loser.body!['code']).toBe('auth.refresh_invalid');
      // No cookie cleared and no revocation: the loser retries with the winner's cookie.
      expect(loser.headers.get('Set-Cookie')).toBeNull();
      expect(
        (await call('POST', '/auth/refresh', { headers: { Cookie: winnerCookie } })).status,
      ).toBe(200);
      now.mockRestore();
    });

    it('logs out by revoking the refresh family', async () => {
      const { cookie } = await signIn();

      const out = await call('POST', '/auth/logout', { headers: { Cookie: cookie } });
      expect(out.status).toBe(204);
      expect(out.headers.get('Set-Cookie')).toContain('Max-Age=0');
      expect((await call('POST', '/auth/refresh', { headers: { Cookie: cookie } })).status).toBe(
        401,
      );
    });

    it('registers an organization with its first admin', async () => {
      const body = {
        organizationName: 'Nyungwe Consulting',
        fullName: 'Test Admin',
        email: 'owner@nyungwe.example',
        password: 'a long enough passphrase',
      };
      const res = await call('POST', '/auth/register-organization', { body });

      expect(res.status).toBe(201);
      expect(res.body!['user'].memberships[0]).toMatchObject({
        organizationName: 'Nyungwe Consulting',
        organizationSlug: 'nyungwe-consulting',
        role: 'ORG_ADMIN',
      });

      const again = await call('POST', '/auth/register-organization', { body });
      expect(again.status).toBe(409);
      expect(again.body!['errors'][0]).toMatchObject({ field: 'email', code: 'auth.email_taken' });
    });

    it('rejects short and breached passwords with params', async () => {
      const res = await call('POST', '/auth/register-organization', {
        body: {
          organizationName: 'X',
          fullName: 'A',
          email: 'a@b.co',
          password: 'short',
          currency: 'rwf',
          timeZone: 'Mars/Base',
        },
      });
      const breached = await call('POST', '/auth/register-organization', {
        body: { organizationName: 'Org', fullName: 'A', email: 'a@b.co', password: 'password1234' },
      });

      expect(res.body!['errors']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'organizationName',
            code: 'length',
            params: { min: 2, max: 100 },
          }),
          expect.objectContaining({
            field: 'password',
            code: 'length',
            params: { min: 12, max: 128 },
          }),
          expect.objectContaining({ field: 'currency', code: 'format' }),
          expect.objectContaining({ field: 'timeZone', code: 'invalid' }),
        ]),
      );
      expect(breached.body!['errors'][0]).toMatchObject({
        field: 'password',
        code: 'password.breached',
      });
    });

    it('resets a password with a single-use token and signs out everywhere', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const { cookie } = await signIn('pm@kora.demo');

      expect(
        (await call('POST', '/auth/password/forgot', { body: { email: 'nobody@x.co' } })).status,
      ).toBe(202);
      expect(
        (await call('POST', '/auth/password/forgot', { body: { email: 'pm@kora.demo' } })).status,
      ).toBe(202);
      const token = db.state.resetTokens[0].token;

      const reset = await call('POST', '/auth/password/reset', {
        body: { token, newPassword: 'a brand new passphrase' },
      });
      expect(reset.status).toBe(204);
      expect(
        (
          await call('POST', '/auth/password/reset', {
            body: { token, newPassword: 'another passphrase!' },
          })
        ).body!['code'],
      ).toBe('auth.reset_token_invalid');
      expect((await call('POST', '/auth/refresh', { headers: { Cookie: cookie } })).status).toBe(
        401,
      );
      expect(
        (
          await call('POST', '/auth/login', {
            body: { email: 'pm@kora.demo', password: 'a brand new passphrase' },
          })
        ).status,
      ).toBe(200);
      info.mockRestore();
    });
  });

  describe('tenancy, roles and locking', () => {
    it('requires a token, a valid tenant header and membership', async () => {
      const { headers } = await signIn('pm@kora.demo');

      expect((await call('GET', '/organization')).body!['code']).toBe('auth.unauthenticated');
      expect(
        (
          await call('GET', '/organization', {
            headers: { Authorization: headers().Authorization },
          })
        ).body!['code'],
      ).toBe('tenant.header_invalid');
      expect(
        (await call('GET', '/organization', { headers: headers(ORG_VIRUNGA) })).body!['code'],
      ).toBe('tenant.forbidden');
      const ok = await call('GET', '/organization', { headers: headers() });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('ETag')).toBe('"1"');
    });

    it('lets only ORG_ADMIN change the organization, with If-Match', async () => {
      const pm = await signIn('pm@kora.demo');
      const admin = await signIn();
      const patch = (headers: Record<string, string>) =>
        call('PATCH', '/organization', { body: { name: 'Akagera Digital' }, headers });

      expect((await patch({ ...pm.headers(), 'If-Match': '"1"' })).body!['code']).toBe(
        'access.denied',
      );
      expect((await patch(admin.headers())).status).toBe(428);
      expect((await patch({ ...admin.headers(), 'If-Match': '*' })).status).toBe(428);
      expect((await patch({ ...admin.headers(), 'If-Match': '"9"' })).status).toBe(412);
      const ok = await patch({ ...admin.headers(), 'If-Match': 'W/"1"' });
      expect(ok.body).toMatchObject({ name: 'Akagera Digital', version: 2 });
      expect(ok.headers.get('ETag')).toBe('"2"');
    });

    it('checks in the API order: 428 → body shape → role → 404 → 412 → domain', async () => {
      const viewer = await signIn('viewer@kora.demo');
      const admin = await signIn();
      const org = (headers: Record<string, string>, body: unknown) =>
        call('PATCH', '/organization', { body, headers });

      // Missing If-Match wins over the role check; a malformed body wins over the role check too.
      expect((await org(viewer.headers(), { name: 'X Ltd' })).status).toBe(428);
      expect((await org({ ...viewer.headers(), 'If-Match': '"1"' }, { name: 'X' })).status).toBe(
        400,
      );
      // A stale version with an invalid body reports the body.
      expect((await org({ ...admin.headers(), 'If-Match': '"9"' }, { name: 'X' })).status).toBe(
        400,
      );
      // Unknown time zone is domain validation: only after the version check passes.
      expect(
        (await org({ ...admin.headers(), 'If-Match': '"9"' }, { timeZone: 'Mars/Base' })).status,
      ).toBe(412);
      expect(
        (await org({ ...admin.headers(), 'If-Match': '"1"' }, { timeZone: 'Mars/Base' })).body![
          'errors'
        ][0],
      ).toMatchObject({ field: 'timeZone', code: 'invalid' });

      // Members: the role check never depends on whether the id exists.
      const missing = '00000000-0000-4000-8000-000000000000';
      const member = (headers: Record<string, string>) =>
        call('PATCH', `/members/${missing}`, {
          body: { role: 'MEMBER' },
          headers: { ...headers, 'If-Match': '"1"' },
        });
      expect((await member(viewer.headers())).body!['code']).toBe('access.denied');
      expect((await member(admin.headers())).status).toBe(404);
    });

    it('rejects a malformed id on DELETE with 400, before the role check (contract 0.1.1)', async () => {
      const viewer = await signIn('viewer@kora.demo');

      for (const path of ['/members/not-a-uuid', '/invitations/not-a-uuid']) {
        const res = await call('DELETE', path, { headers: viewer.headers() });
        expect(res.status).toBe(400);
        expect(res.body!['detail']).toBe('The request has invalid fields');
        expect(res.body!['errors']).toEqual([
          {
            field: path.startsWith('/members') ? 'memberId' : 'invitationId',
            code: 'invalid',
            message: 'must be a valid UUID',
          },
        ]);
      }
      const wellFormed = await call('DELETE', '/members/00000000-0000-4000-8000-000000000000', {
        headers: viewer.headers(),
      });
      expect(wellFormed.body!['code']).toBe('access.denied');
    });

    it('updates the profile without If-Match and validates it', async () => {
      const { headers } = await signIn('member@kora.demo');
      const auth = { Authorization: headers().Authorization };

      expect((await call('PATCH', '/me', { body: {}, headers: auth })).status).toBe(400);
      expect(
        (await call('PATCH', '/me', { body: { locale: 'de' }, headers: auth })).body!['errors'][0],
      ).toMatchObject({
        field: 'locale',
        code: 'format',
      });
      const ok = await call('PATCH', '/me', {
        body: { fullName: 'Eric N.', locale: 'fr' },
        headers: auth,
      });
      expect(ok.body).toMatchObject({ fullName: 'Eric N.', locale: 'fr' });
      expect((await call('GET', '/me', { headers: auth })).body!['fullName']).toBe('Eric N.');
    });
  });

  describe('members', () => {
    it('searches, filters, sorts and pages, capping size at 100', async () => {
      const { headers } = await signIn();

      const all = await call('GET', '/members?size=500', { headers: headers() });
      expect(all.body).toMatchObject({ page: 0, size: 100, totalElements: 23, totalPages: 1 });
      expect(all.body!['content'][0].fullName).toBe('Alice Umutoni');

      const pms = await call('GET', '/members?role=PROJECT_MANAGER&sort=fullName,desc', {
        headers: headers(),
      });
      expect(pms.body!['content'].map((m: { fullName: string }) => m.fullName)).toEqual([
        'Odette Mukamurenzi',
        'Herve Munyaneza',
        'Grace Mukamana',
        'Alice Umutoni',
      ]);

      const search = await call('GET', '/members?q=KORA.DEMO&size=2&page=1', {
        headers: headers(),
      });
      expect(search.body).toMatchObject({ page: 1, size: 2, totalElements: 5, totalPages: 3 });
    });

    it('rejects unknown sort fields and roles', async () => {
      const { headers } = await signIn();

      const sort = await call('GET', '/members?sort=password,asc', { headers: headers() });
      expect(sort.body!['errors'][0]).toMatchObject({
        field: 'sort',
        code: 'invalid',
        params: { allowed: ['fullName', 'email', 'role', 'joinedAt'] },
      });
      expect((await call('GET', '/members?role=KING', { headers: headers() })).status).toBe(400);
    });

    it("protects the last admin and self-removal, and hides other tenants' members", async () => {
      const { headers } = await signIn();
      const adminMembership = db.membership('6f1e2d3c-4b5a-4c6d-8e7f-000000000001', ORG_AKAGERA)!;
      const virungaMembership = db.state.memberships.find((m) => m.organizationId === ORG_VIRUNGA)!;

      const demote = await call('PATCH', `/members/${adminMembership.id}`, {
        body: { role: 'MEMBER' },
        headers: { ...headers(), 'If-Match': '"1"' },
      });
      expect(demote.body!['code']).toBe('members.last_admin');
      expect(
        (await call('DELETE', `/members/${adminMembership.id}`, { headers: headers() })).body![
          'code'
        ],
      ).toBe('members.self_removal');
      expect(
        (await call('DELETE', `/members/${virungaMembership.id}`, { headers: headers() })).status,
      ).toBe(404);
    });

    it('changes a role with If-Match and removes a member', async () => {
      const { headers } = await signIn();
      const viewer = db.membership('6f1e2d3c-4b5a-4c6d-8e7f-000000000005', ORG_AKAGERA)!;

      const changed = await call('PATCH', `/members/${viewer.id}`, {
        body: { role: 'MEMBER' },
        headers: { ...headers(), 'If-Match': '"1"' },
      });
      expect(changed.body).toMatchObject({ role: 'MEMBER', version: 2 });
      expect((await call('DELETE', `/members/${viewer.id}`, { headers: headers() })).status).toBe(
        204,
      );
      expect(
        (await call('GET', '/members?q=viewer@', { headers: headers() })).body!['totalElements'],
      ).toBe(0);
    });
  });

  describe('invitations', () => {
    it('lists by status for admins only, newest first', async () => {
      const admin = await signIn();
      const pm = await signIn('pm@kora.demo');

      const pending = await call('GET', '/invitations?status=PENDING', {
        headers: admin.headers(),
      });
      expect(pending.body!['content'].map((i: { email: string }) => i.email)).toEqual([
        'new.person@example.com',
        'sandrine.uwera@example.com',
        'kevin.mutabazi@example.com',
      ]);
      expect((await call('GET', '/invitations', { headers: pm.headers() })).status).toBe(403);
    });

    it('creates, refuses duplicates and existing members, and revokes', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const { headers } = await signIn();
      const invite = (email: string) =>
        call('POST', '/invitations', { body: { email, role: 'MEMBER' }, headers: headers() });

      const created = await invite('fresh@example.com');
      expect(created.status).toBe(201);
      expect(created.headers.get('Location')).toBe(`/api/v1/invitations/${created.body!['id']}`);
      expect((await invite('fresh@example.com')).body!['code']).toBe('invitations.already_pending');
      expect((await invite('pm@kora.demo')).body!['errors'][0]).toMatchObject({
        field: 'email',
        code: 'invitations.already_member',
      });

      expect(
        (await call('DELETE', `/invitations/${created.body!['id']}`, { headers: headers() }))
          .status,
      ).toBe(204);
      expect(
        (await call('DELETE', `/invitations/${created.body!['id']}`, { headers: headers() })).body![
          'code'
        ],
      ).toBe('invitations.not_pending');
      info.mockRestore();
    });

    it('previews public tokens and reports unusable ones', async () => {
      const preview = await call('GET', `/invitations/token/${DEMO_INVITATION_TOKENS.newAccount}`);
      expect(preview.body).toMatchObject({
        organizationName: 'Akagera Digital Ltd',
        email: 'new.person@example.com',
        existingAccount: false,
      });
      expect(
        (await call('GET', `/invitations/token/${DEMO_INVITATION_TOKENS.existingAccount}`)).body![
          'existingAccount'
        ],
      ).toBe(true);
      expect(
        (await call('GET', `/invitations/token/${DEMO_INVITATION_TOKENS.expired}`)).body!['code'],
      ).toBe('invitations.expired');
      expect((await call('GET', '/invitations/token/demo-invite-revoked-0006')).body!['code']).toBe(
        'invitations.revoked',
      );
      expect(
        (await call('GET', '/invitations/token/demo-invite-accepted-0007')).body!['code'],
      ).toBe('invitations.already_accepted');
      expect((await call('GET', '/invitations/token/no-such-token-anywhere')).status).toBe(404);
    });

    it('accepts for a new account and for an existing one', async () => {
      const newAccount = await call(
        'POST',
        `/invitations/token/${DEMO_INVITATION_TOKENS.newAccount}/accept`,
        {
          body: { fullName: 'New Person', password: 'a long enough passphrase' },
        },
      );
      expect(newAccount.status).toBe(200);
      expect(newAccount.body!['user']).toMatchObject({
        email: 'new.person@example.com',
        fullName: 'New Person',
      });
      expect(
        (await call('GET', `/invitations/token/${DEMO_INVITATION_TOKENS.newAccount}`)).status,
      ).toBe(410);

      const token = DEMO_INVITATION_TOKENS.existingAccount;
      expect(
        (await call('POST', `/invitations/token/${token}/accept`, { body: { password: 'wrong' } }))
          .body!['code'],
      ).toBe('auth.invalid_credentials');
      const existing = await call('POST', `/invitations/token/${token}/accept`, {
        body: { password: DEMO_PASSWORD },
      });
      expect(
        existing.body!['user'].memberships.map(
          (m: { organizationName: string }) => m.organizationName,
        ),
      ).toEqual(['Akagera Digital Ltd', 'Virunga Build Partners']);
    });
  });
});
