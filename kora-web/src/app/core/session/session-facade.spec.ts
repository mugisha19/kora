import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ApplicationInitStatus, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NEVER, firstValueFrom, of, throwError } from 'rxjs';
import { aSession } from '../../../testing/fixtures';
import { provideMockApi, resetMockApi, signInAs } from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { ORG_VIRUNGA } from '../../mocks/data';
import { AuthApi } from '../api/auth.api';
import { LanguageService } from '../i18n/language.service';
import { PREFERENCE_KEYS } from '../storage/preferences';
import { SessionRefresher } from './session-refresher';
import { RESTORE_TIMEOUT_MS, SessionFacade } from './session.facade';
import { provideSessionRestore } from './session.providers';
import { SessionStore } from './session.store';

@Component({ template: '' })
class Blank {}

describe('SessionFacade', () => {
  let announce: ReturnType<typeof vi.spyOn>;

  function setup(extra: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        ...provideTestUi(),
        ...provideMockApi(),
        provideRouter([
          { path: 'login', component: Blank },
          { path: 'dashboard', component: Blank },
          { path: 'admin/members', component: Blank },
        ]),
        ...(extra as never[]),
      ],
    });
    announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce').mockResolvedValue();
    return {
      facade: TestBed.inject(SessionFacade),
      store: TestBed.inject(SessionStore),
      router: TestBed.inject(Router),
    };
  }

  beforeEach(() => resetMockApi());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('begins a session, applies the profile language and follows a safe return URL', async () => {
    const { facade, store, router } = setup();
    const session = { ...aSession(), user: { ...aSession().user, locale: 'fr' as const } };

    await facade.begin(session, { returnUrl: '/admin/members' });

    expect(store.isAuthenticated()).toBe(true);
    expect(TestBed.inject(LanguageService).current()).toBe('fr');
    expect(router.url).toBe('/admin/members');
  });

  it('ignores an unsafe return URL and can open a given organization', async () => {
    const { facade, store, router } = setup();
    const session = aSession();

    await facade.begin(session, {
      returnUrl: 'https://evil.example',
      organizationId: session.user.memberships[1].organizationId,
    });

    expect(router.url).toBe('/dashboard');
    expect(store.activeRole()).toBe('PMO');
  });

  it('restores a session from the refresh cookie', async () => {
    const { facade, store } = setup();
    await signInAs('member@kora.demo');
    store.clear(); // a reload: the in-memory token is gone, the cookie is not

    await facade.restore();

    expect(store.user()?.email).toBe('member@kora.demo');
    expect(TestBed.inject(LanguageService).current()).toBe('rw');
  });

  it('starts signed out when there is no session, or the API is too slow', async () => {
    const { facade, store } = setup();
    await facade.restore();
    expect(store.isAuthenticated()).toBe(false);

    vi.useFakeTimers();
    vi.spyOn(TestBed.inject(AuthApi), 'refresh').mockReturnValue(NEVER);
    const restoring = facade.restore();
    await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS + 1);
    await expect(restoring).resolves.toBeUndefined();
    vi.useRealTimers();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('switches organization, announces it and opens its dashboard', async () => {
    const { facade, store, router } = setup();
    await signInAs('admin@kora.demo');

    expect(await facade.switchOrganization('not-mine')).toBe(false);
    await facade.switchOrganization(ORG_VIRUNGA);

    expect(store.activeOrganizationId()).toBe(ORG_VIRUNGA);
    expect(localStorage.getItem(PREFERENCE_KEYS.organization)).toBe(ORG_VIRUNGA);
    expect(announce).toHaveBeenCalledWith('Switched to Virunga Build Partners', 'polite');
    expect(router.url).toBe('/dashboard');
  });

  it('re-reads /me', async () => {
    const { facade, store } = setup();
    await signInAs('pm@kora.demo');
    store.setUser({ ...store.user()!, fullName: 'Stale' });

    await facade.refreshUser();

    expect(store.user()?.fullName).toBe('Grace Mukamana');
  });

  it('on expiry goes to sign-in with the page to come back to', async () => {
    const { facade, store, router } = setup();
    await signInAs('pm@kora.demo');
    await router.navigateByUrl('/admin/members');

    await facade.expire();

    expect(store.isAuthenticated()).toBe(false);
    expect(router.url).toBe('/login?returnUrl=%2Fadmin%2Fmembers&reason=expired');
  });

  it('signs out even when the API call fails', async () => {
    const { facade, store, router } = setup();
    await signInAs('pm@kora.demo');
    vi.spyOn(TestBed.inject(AuthApi), 'logout').mockReturnValue(
      throwError(() => new Error('down')),
    );

    await facade.signOut();

    expect(store.isAuthenticated()).toBe(false);
    expect(router.url).toBe('/login');
  });

  it('provideSessionRestore restores before start-up and handles later expiry', async () => {
    // App initializers run on the first inject, so the spies go on the prototypes beforehand.
    const refresh = vi
      .spyOn(AuthApi.prototype, 'refresh')
      .mockReturnValue(of(aSession('restored')));
    const expire = vi.spyOn(SessionFacade.prototype, 'expire').mockResolvedValue(true);
    setup([provideSessionRestore()]);

    await TestBed.inject(ApplicationInitStatus).donePromise;
    expect(TestBed.inject(SessionStore).accessToken()).toBe('restored');

    // A later failed refresh of an existing session reports expiry.
    refresh.mockReturnValue(
      throwError(() => ({ status: 401, code: 'auth.unauthenticated', fieldErrors: [] })),
    );
    await firstValueFrom(TestBed.inject(SessionRefresher).refresh()).catch(() => undefined);
    expect(expire).toHaveBeenCalledOnce();
  });
});
