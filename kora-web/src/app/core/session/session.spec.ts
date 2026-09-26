import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ORG_A, ORG_B, aSession as session, aUser as user } from '../../../testing/fixtures';
import { PREFERENCE_KEYS } from '../storage/preferences';
import { NOW } from './clock';
import { REFRESH_RETRY_DELAY_MS, SessionRefresher } from './session-refresher';
import { SessionStore } from './session.store';

describe('session', () => {
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NOW, useValue: () => now },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  describe('SessionStore', () => {
    it('starts signed out', () => {
      const store = TestBed.inject(SessionStore);

      expect(store.isAuthenticated()).toBe(false);
      expect(store.memberships()).toEqual([]);
      expect(store.activeRole()).toBeNull();
      expect(store.expiresWithin(10_000)).toBe(false);
    });

    it('starts a session on the first organization and tracks expiry', () => {
      const store = TestBed.inject(SessionStore);

      store.start(session('t', 900));

      expect(store.isAuthenticated()).toBe(true);
      expect(store.activeOrganizationId()).toBe(ORG_A);
      expect(store.activeRole()).toBe('ORG_ADMIN');
      expect(store.expiresWithin(10_000)).toBe(false);
      now += 891_000;
      expect(store.expiresWithin(10_000)).toBe(true);
    });

    it('prefers the organization remembered on this device, if still a member', () => {
      localStorage.setItem(PREFERENCE_KEYS.organization, ORG_B);
      const store = TestBed.inject(SessionStore);

      store.start(session());
      expect(store.activeOrganizationId()).toBe(ORG_B);

      localStorage.setItem(PREFERENCE_KEYS.organization, 'gone');
      store.setUser(user());
      expect(store.activeOrganizationId()).toBe(ORG_B);
    });

    it('switches only to organizations the user belongs to, and remembers the switch', () => {
      const store = TestBed.inject(SessionStore);
      store.start(session());

      expect(store.switchOrganization('elsewhere')).toBe(false);
      expect(store.switchOrganization(ORG_B)).toBe(true);
      expect(store.activeRole()).toBe('PMO');
      expect(localStorage.getItem(PREFERENCE_KEYS.organization)).toBe(ORG_B);
    });

    it('falls back to no organization when the user has none', () => {
      const store = TestBed.inject(SessionStore);
      store.start({ ...session(), user: user({ memberships: [] }) });

      expect(store.activeOrganizationId()).toBeNull();
      expect(store.activeMembership()).toBeNull();
    });

    it('clears everything on sign-out', () => {
      const store = TestBed.inject(SessionStore);
      store.start(session());

      store.clear();

      expect(store.isAuthenticated()).toBe(false);
      expect(store.accessToken()).toBeNull();
      expect(store.activeOrganizationId()).toBeNull();
    });
  });

  describe('SessionRefresher', () => {
    it('shares one refresh call between concurrent callers (single flight)', async () => {
      const refresher = TestBed.inject(SessionRefresher);
      const http = TestBed.inject(HttpTestingController);

      const results = Array.from({ length: 10 }, () => firstValueFrom(refresher.refresh()));
      http.expectOne('/api/v1/auth/refresh').flush(session('fresh'));

      const sessions = await Promise.all(results);
      expect(sessions.every((s) => s.accessToken === 'fresh')).toBe(true);
      expect(TestBed.inject(SessionStore).accessToken()).toBe('fresh');

      // Once settled, the next refresh is a new call.
      void firstValueFrom(refresher.refresh());
      http.expectOne('/api/v1/auth/refresh').flush(session('fresher'));
      http.verify();
    });

    it('on failure clears the session and reports expiry only if there was a session', async () => {
      const refresher = TestBed.inject(SessionRefresher);
      const store = TestBed.inject(SessionStore);
      const http = TestBed.inject(HttpTestingController);
      const expired = vi.fn();
      refresher.expired$.subscribe(expired);

      // No session yet (e.g. start-up restore): failing is just "signed out".
      const first = firstValueFrom(refresher.refresh());
      http
        .expectOne('/api/v1/auth/refresh')
        .flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
      await expect(first).rejects.toBeTruthy();
      expect(expired).not.toHaveBeenCalled();

      store.start(session());
      const second = firstValueFrom(refresher.refresh());
      http
        .expectOne('/api/v1/auth/refresh')
        .flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
      await expect(second).rejects.toBeTruthy();
      expect(expired).toHaveBeenCalledOnce();
      expect(store.isAuthenticated()).toBe(false);
    });

    describe('two tabs refreshing at once', () => {
      const refreshInvalid = [
        { status: 401, code: 'auth.refresh_invalid' },
        { status: 401, statusText: 'Unauthorized' },
      ] as const;
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

      beforeEach(() => TestBed.overrideProvider(REFRESH_RETRY_DELAY_MS, { useValue: 0 }));

      it('retries once after losing the race, and keeps the session', async () => {
        const refresher = TestBed.inject(SessionRefresher);
        const http = TestBed.inject(HttpTestingController);
        const expired = vi.fn();
        refresher.expired$.subscribe(expired);
        TestBed.inject(SessionStore).start(session('old'));

        const result = firstValueFrom(refresher.refresh());
        http.expectOne('/api/v1/auth/refresh').flush(...refreshInvalid);
        await tick();
        http.expectOne('/api/v1/auth/refresh').flush(session('from-other-tab'));

        expect((await result).accessToken).toBe('from-other-tab');
        expect(expired).not.toHaveBeenCalled();
      });

      it('gives up when the retry is rejected too', async () => {
        const refresher = TestBed.inject(SessionRefresher);
        const http = TestBed.inject(HttpTestingController);
        TestBed.inject(SessionStore).start(session('old'));

        const result = firstValueFrom(refresher.refresh());
        result.catch(() => undefined);
        http.expectOne('/api/v1/auth/refresh').flush(...refreshInvalid);
        await tick();
        http.expectOne('/api/v1/auth/refresh').flush(...refreshInvalid);

        await expect(result).rejects.toBeTruthy();
        expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(false);
        http.verify();
      });
    });
  });
});
