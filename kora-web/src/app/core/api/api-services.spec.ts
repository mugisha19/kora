import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from './auth.api';
import { AUTH_REQUEST, SILENT_ERRORS, SKIP_LOADING } from './http-context';
import { ifMatch, toHttpParams } from './http-params';
import { InvitationsApi } from './invitations.api';
import { MeApi } from './me.api';
import { MembersApi } from './members.api';
import { OrganizationApi } from './organization.api';

describe('API services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('helpers', () => {
    it('drops empty query values and repeats array values', () => {
      const params = toHttpParams({
        q: '',
        role: 'PMO',
        page: 0,
        size: undefined,
        sort: ['fullName,asc', 'email,desc'],
      });

      expect(params.toString()).toBe('role=PMO&page=0&sort=fullName,asc&sort=email,desc');
    });

    it('quotes the version for If-Match', () => {
      expect(ifMatch(7)).toBe('"7"');
    });
  });

  describe('AuthApi', () => {
    it('marks every auth call as part of the auth flow', () => {
      const api = TestBed.inject(AuthApi);
      api.login({ email: 'a@b.co', password: 'x' }).subscribe();
      api
        .registerOrganization({
          organizationName: 'Org',
          fullName: 'A',
          email: 'a@b.co',
          password: 'p'.repeat(12),
        })
        .subscribe();
      api.forgotPassword({ email: 'a@b.co' }).subscribe();
      api.resetPassword({ token: 't'.repeat(20), newPassword: 'p'.repeat(12) }).subscribe();

      for (const path of ['login', 'register-organization', 'password/forgot', 'password/reset']) {
        const req = http.expectOne(`/api/v1/auth/${path}`);
        expect(req.request.method).toBe('POST');
        expect(req.request.context.get(AUTH_REQUEST)).toBe(true);
        req.flush({});
      }
    });

    it('refreshes and signs out silently, without the progress bar for refresh', () => {
      const api = TestBed.inject(AuthApi);
      api.refresh().subscribe();
      api.logout().subscribe();

      const refresh = http.expectOne('/api/v1/auth/refresh');
      expect(refresh.request.body).toBeNull();
      expect(refresh.request.context.get(SILENT_ERRORS)).toBe(true);
      expect(refresh.request.context.get(SKIP_LOADING)).toBe(true);
      refresh.flush({});

      const logout = http.expectOne('/api/v1/auth/logout');
      expect(logout.request.context.get(SILENT_ERRORS)).toBe(true);
      logout.flush(null);
    });
  });

  it('MeApi reads and patches /me', () => {
    const api = TestBed.inject(MeApi);
    api.get().subscribe();
    api.update({ locale: 'fr' }).subscribe();

    expect(http.expectOne({ method: 'GET', url: '/api/v1/me' })).toBeTruthy();
    const patch = http.expectOne({ method: 'PATCH', url: '/api/v1/me' });
    expect(patch.request.body).toEqual({ locale: 'fr' });
    expect(patch.request.headers.has('If-Match')).toBe(false);
  });

  it('OrganizationApi sends If-Match on update', () => {
    const api = TestBed.inject(OrganizationApi);
    api.get().subscribe();
    api.update({ name: 'New' }, 3).subscribe();

    http.expectOne({ method: 'GET', url: '/api/v1/organization' });
    const patch = http.expectOne({ method: 'PATCH', url: '/api/v1/organization' });
    expect(patch.request.headers.get('If-Match')).toBe('"3"');
  });

  it('MembersApi lists with contract parameters, changes roles with If-Match and removes', () => {
    const api = TestBed.inject(MembersApi);
    api.list({ q: 'ali', role: 'PMO', page: 1, size: 10, sort: ['joinedAt,desc'] }).subscribe();
    api.list().subscribe();
    api.changeRole('m/1', 'VIEWER', 4).subscribe();
    api.remove('m-2').subscribe();

    const list = http.expectOne((req) => req.url === '/api/v1/members' && req.params.has('q'));
    expect(list.request.params.toString()).toBe('q=ali&role=PMO&page=1&size=10&sort=joinedAt,desc');
    http.expectOne((req) => req.url === '/api/v1/members' && req.params.keys().length === 0);
    const patch = http.expectOne('/api/v1/members/m%2F1');
    expect(patch.request.body).toEqual({ role: 'VIEWER' });
    expect(patch.request.headers.get('If-Match')).toBe('"4"');
    expect(http.expectOne({ method: 'DELETE', url: '/api/v1/members/m-2' })).toBeTruthy();
  });

  it('InvitationsApi covers admin and public operations', () => {
    const api = TestBed.inject(InvitationsApi);
    api.list({ status: 'PENDING' }).subscribe();
    api.list().subscribe();
    api.create({ email: 'x@y.co', role: 'MEMBER' }).subscribe();
    api.revoke('i-1').subscribe();
    api.preview('tok en').subscribe();
    api.accept('tok en', { password: 'secret' }).subscribe();

    expect(http.expectOne('/api/v1/invitations?status=PENDING')).toBeTruthy();
    http.expectOne(
      (req) =>
        req.url === '/api/v1/invitations' && req.method === 'GET' && !req.params.has('status'),
    );
    expect(http.expectOne({ method: 'POST', url: '/api/v1/invitations' }).request.body).toEqual({
      email: 'x@y.co',
      role: 'MEMBER',
    });
    http.expectOne({ method: 'DELETE', url: '/api/v1/invitations/i-1' });
    const preview = http.expectOne({ method: 'GET', url: '/api/v1/invitations/token/tok%20en' });
    expect(preview.request.context.get(AUTH_REQUEST)).toBe(true);
    const accept = http.expectOne('/api/v1/invitations/token/tok%20en/accept');
    expect(accept.request.context.get(AUTH_REQUEST)).toBe(true);
  });
});
