import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { ORG_A, ORG_B, aSession, problem } from '../../../testing/fixtures';
import { provideTestI18n } from '../../../testing/test-providers';
import { ApiError } from '../api/api-error';
import { SILENT_ERRORS, SKIP_LOADING, authFlow } from '../api/http-context';
import { Notifier } from '../notify/notifier';
import { NOW } from '../session/clock';
import { REFRESH_RETRY_DELAY_MS, SessionRefresher } from '../session/session-refresher';
import { SessionStore } from '../session/session.store';
import { API_INTERCEPTORS, RETRY_POLICY } from './interceptors';
import { LoadingService } from './loading.service';

/**
 * Subscribes now and marks the rejection as handled, so a request that fails during `flush()`
 * (before the test awaits it) isn't reported as an unhandled rejection.
 */
function request<T>(source: Observable<T>): Promise<T> {
  const promise = firstValueFrom(source);
  promise.catch(() => undefined);
  return promise;
}

/** Lets timer-based retries and chained requests reach the testing backend. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('API interceptor chain', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: SessionStore;
  let notifier: { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    notifier = { error: vi.fn(), success: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors(API_INTERCEPTORS)),
        provideHttpClientTesting(),
        provideTestI18n(),
        { provide: Notifier, useValue: notifier },
        { provide: NOW, useValue: () => now },
        { provide: REFRESH_RETRY_DELAY_MS, useValue: 0 },
        {
          provide: RETRY_POLICY,
          useValue: { maxRetries: 2, baseDelayMs: 0, maxRetryAfterSeconds: 5 },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  const signIn = (token = 'token-1', expiresIn = 900) => store.start(aSession(token, expiresIn));
  const silent = () => new HttpContext().set(SILENT_ERRORS, true);

  describe('correlation id', () => {
    it('tags API requests with a UUID and keeps one the caller set', () => {
      http.get('/api/v1/me').subscribe();
      http.get('/api/v1/me', { headers: { 'X-Correlation-Id': 'mine' } }).subscribe();

      const [generated, explicit] = backend.match('/api/v1/me');
      expect(generated.request.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
      expect(explicit.request.headers.get('X-Correlation-Id')).toBe('mine');
      generated.flush({});
      explicit.flush({});
    });

    it('leaves non-API requests alone', () => {
      signIn();
      http.get('i18n/en.json').subscribe();

      const req = backend.expectOne('i18n/en.json');
      expect(req.request.headers.keys()).toEqual([]);
      req.flush({});
    });
  });

  describe('loading', () => {
    it('is active while any API request is pending', () => {
      const loading = TestBed.inject(LoadingService);

      http.get('/api/v1/members').subscribe();
      http.get('/api/v1/organization').subscribe();
      expect(loading.active()).toBe(true);

      backend.expectOne('/api/v1/members').flush({});
      expect(loading.active()).toBe(true);
      backend.expectOne('/api/v1/organization').flush({});
      expect(loading.active()).toBe(false);
    });

    it('ignores requests marked SKIP_LOADING and never goes negative', () => {
      const loading = TestBed.inject(LoadingService);

      http
        .post('/api/v1/auth/refresh', null, { context: authFlow().set(SKIP_LOADING, true) })
        .subscribe();
      expect(loading.active()).toBe(false);
      backend.expectOne('/api/v1/auth/refresh').flush({});

      loading.end();
      loading.begin();
      expect(loading.active()).toBe(true);
    });
  });

  describe('error toast', () => {
    it('turns a failed write into a translated toast with its reference and rethrows an ApiError', async () => {
      signIn();
      const result = request(http.patch('/api/v1/members/m-1', { role: 'VIEWER' }));

      backend.expectOne('/api/v1/members/m-1').flush(...problem(409, 'members.last_admin'));

      await expect(result).rejects.toMatchObject({
        status: 409,
        code: 'members.last_admin',
      } satisfies Partial<ApiError>);
      expect(notifier.error).toHaveBeenCalledWith(
        'The organization needs at least one administrator.',
        'corr-1',
      );
    });

    it('stays quiet for reads, field validation, 401s and silent requests', async () => {
      const results = Promise.allSettled([
        request(http.get('/api/v1/organization')),
        request(http.post('/api/v1/invitations', { email: 'bad' })),
        request(http.delete('/api/v1/members/m-1')),
        request(http.post('/api/v1/members', {}, { context: silent() })),
      ]);

      backend.expectOne('/api/v1/organization').flush(...problem(403, 'access.denied'));
      backend.expectOne('/api/v1/invitations').flush(
        ...problem(400, 'validation.failed', {
          errors: [{ field: 'email', code: 'email', message: 'invalid' }],
        }),
      );
      backend.expectOne('/api/v1/members/m-1').flush(...problem(401, 'auth.unauthenticated'));
      backend.expectOne('/api/v1/members').flush(...problem(409, 'members.last_admin'));

      expect((await results).every((r) => r.status === 'rejected')).toBe(true);
      expect(notifier.error).not.toHaveBeenCalled();
    });

    it('toasts a network failure on a write without a reference', async () => {
      const result = request(http.post('/api/v1/invitations', {}));

      backend.expectOne('/api/v1/invitations').error(new ProgressEvent('error'), { status: 0 });

      await expect(result).rejects.toMatchObject({ code: 'network.offline' });
      expect(notifier.error).toHaveBeenCalledWith(
        "Can't reach Kora. Check your connection.",
        undefined,
      );
    });
  });

  describe('retry', () => {
    it('retries transient failures of reads with backoff, then succeeds', async () => {
      const result = request(http.get<{ ok: boolean }>('/api/v1/members'));

      backend.expectOne('/api/v1/members').flush(...problem(503, 'internal.error'));
      await tick();
      backend.expectOne('/api/v1/members').error(new ProgressEvent('error'), { status: 0 });
      await tick();
      backend.expectOne('/api/v1/members').flush({ ok: true });

      expect(await result).toEqual({ ok: true });
    });

    it('gives up after the configured number of retries', async () => {
      const result = request(http.get('/api/v1/members'));

      for (let attempt = 0; attempt < 3; attempt++) {
        backend.expectOne('/api/v1/members').flush(...problem(502, 'internal.error'));
        await tick();
      }

      await expect(result).rejects.toMatchObject({ status: 502 });
    });

    it('never retries writes or non-transient errors', async () => {
      const write = request(http.post('/api/v1/invitations', {}, { context: silent() }));
      const missing = request(http.get('/api/v1/members/x'));

      backend.expectOne('/api/v1/invitations').flush(...problem(503, 'internal.error'));
      backend.expectOne('/api/v1/members/x').flush(...problem(404, 'resource.not_found'));
      await tick();

      await expect(write).rejects.toMatchObject({ status: 503 });
      await expect(missing).rejects.toMatchObject({ status: 404 });
    });

    it('honours a short Retry-After on 429 and gives up on a long one', async () => {
      const short = request(http.get('/api/v1/members'));
      backend
        .expectOne('/api/v1/members')
        .flush(...problem(429, 'rate_limited', { headers: { 'Retry-After': '0' } }));
      await tick();
      backend.expectOne('/api/v1/members').flush({});
      await expect(short).resolves.toEqual({});

      const long = request(http.get('/api/v1/members'));
      backend
        .expectOne('/api/v1/members')
        .flush(...problem(429, 'rate_limited', { headers: { 'Retry-After': '30' } }));
      await expect(long).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 30 });
    });
  });

  describe('auth', () => {
    it('attaches the bearer token, but not to auth-flow requests', () => {
      signIn('abc');
      http.get('/api/v1/me').subscribe();
      http.post('/api/v1/auth/login', {}, { context: authFlow() }).subscribe();

      expect(backend.expectOne('/api/v1/me').request.headers.get('Authorization')).toBe(
        'Bearer abc',
      );
      expect(backend.expectOne('/api/v1/auth/login').request.headers.has('Authorization')).toBe(
        false,
      );
    });

    it('sends no Authorization header when signed out, and does not try to refresh on 401', async () => {
      const result = request(http.get('/api/v1/me'));

      const req = backend.expectOne('/api/v1/me');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(...problem(401, 'auth.unauthenticated'));

      await expect(result).rejects.toMatchObject({ status: 401 });
      backend.expectNone('/api/v1/auth/refresh');
    });

    it('refreshes proactively when the token is about to expire', async () => {
      signIn('old', 900);
      now += 895_000;
      const result = request(http.get('/api/v1/me'));

      backend.expectOne('/api/v1/auth/refresh').flush(aSession('new'));
      await tick();
      const req = backend.expectOne('/api/v1/me');
      expect(req.request.headers.get('Authorization')).toBe('Bearer new');
      req.flush({ id: 'u-1' });

      await expect(result).resolves.toEqual({ id: 'u-1' });
    });

    it('on 401 refreshes once and replays, for any number of parallel requests', async () => {
      signIn('old');
      const results = Promise.all(
        Array.from({ length: 10 }, (_, i) => request(http.get(`/api/v1/members?n=${i}`))),
      );

      for (const req of backend.match((r) => r.url.startsWith('/api/v1/members?n='))) {
        req.flush(...problem(401, 'auth.unauthenticated'));
      }
      backend.expectOne('/api/v1/auth/refresh').flush(aSession('new'));
      await tick();

      const replays = backend.match((r) => r.url.startsWith('/api/v1/members?n='));
      expect(replays).toHaveLength(10);
      for (const req of replays) {
        expect(req.request.headers.get('Authorization')).toBe('Bearer new');
        req.flush({});
      }
      expect(await results).toHaveLength(10);
    });

    it('replays with a token another request already refreshed, without refreshing again', async () => {
      signIn('old');
      const result = request(http.get('/api/v1/members'));
      const pending = backend.expectOne('/api/v1/members');

      store.start(aSession('refreshed-meanwhile'));
      pending.flush(...problem(401, 'auth.unauthenticated'));
      await tick();

      backend.expectNone('/api/v1/auth/refresh');
      const replay = backend.expectOne('/api/v1/members');
      expect(replay.request.headers.get('Authorization')).toBe('Bearer refreshed-meanwhile');
      replay.flush({});
      await expect(result).resolves.toEqual({});
    });

    it('reports an expired session when the refresh fails', async () => {
      signIn('old');
      const expired = vi.fn();
      TestBed.inject(SessionRefresher).expired$.subscribe(expired);
      const result = request(http.get('/api/v1/members'));

      backend.expectOne('/api/v1/members').flush(...problem(401, 'auth.unauthenticated'));
      backend.expectOne('/api/v1/auth/refresh').flush(...problem(401, 'auth.refresh_invalid'));
      // Retried once (another tab may have won the race), then given up.
      await tick();
      backend.expectOne('/api/v1/auth/refresh').flush(...problem(401, 'auth.refresh_invalid'));

      await expect(result).rejects.toMatchObject({ code: 'auth.refresh_invalid' });
      expect(expired).toHaveBeenCalledOnce();
      expect(store.isAuthenticated()).toBe(false);
      expect(notifier.error).not.toHaveBeenCalled();
    });
  });

  describe('tenant', () => {
    it('adds the active organization to tenant-scoped calls only', () => {
      signIn();
      http.get('/api/v1/members').subscribe();
      http.get('/api/v1/me').subscribe();
      http.post('/api/v1/auth/logout', null, { context: authFlow() }).subscribe();
      http.get('/api/v1/invitations/token/abc', { context: authFlow() }).subscribe();
      http.get('/api/v1/organization', { headers: { 'X-Organization-Id': ORG_B } }).subscribe();

      expect(backend.expectOne('/api/v1/members').request.headers.get('X-Organization-Id')).toBe(
        ORG_A,
      );
      expect(backend.expectOne('/api/v1/me').request.headers.has('X-Organization-Id')).toBe(false);
      expect(
        backend.expectOne('/api/v1/auth/logout').request.headers.has('X-Organization-Id'),
      ).toBe(false);
      expect(
        backend.expectOne('/api/v1/invitations/token/abc').request.headers.has('X-Organization-Id'),
      ).toBe(false);
      expect(
        backend.expectOne('/api/v1/organization').request.headers.get('X-Organization-Id'),
      ).toBe(ORG_B);
    });

    it('sends no tenant header when no organization is active', () => {
      http.get('/api/v1/members').subscribe();

      expect(backend.expectOne('/api/v1/members').request.headers.has('X-Organization-Id')).toBe(
        false,
      );
    });
  });
});
