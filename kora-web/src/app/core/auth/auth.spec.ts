import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { aSession } from '../../../testing/fixtures';
import { provideTestUi } from '../../../testing/test-providers';
import { Notifier } from '../notify/notifier';
import { SessionStore } from '../session/session.store';
import { authGuard, guestGuard, roleGuard } from './auth.guards';
import { DEFAULT_AFTER_SIGN_IN, safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  it.each([
    ['/settings', '/settings'],
    ['/admin/members?q=ali#top', '/admin/members?q=ali#top'],
    ['/a/../settings', '/settings'],
  ])('keeps same-app path %s', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['https://evil.example'],
    ['//evil.example/path'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['settings'],
    ['/\tevil'],
    ['/ok\nhttps://evil.example'],
    ['/login'],
    ['/reset-password?token=x'],
  ])('falls back to the dashboard for %j', (input) => {
    expect(safeReturnUrl(input)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});

@Component({ template: '' })
class Blank {}

describe('guards', () => {
  let notifier: { info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notifier = { info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ...provideTestUi(),
        { provide: Notifier, useValue: notifier },
        provideRouter([
          { path: 'login', component: Blank, canActivate: [guestGuard] },
          { path: 'dashboard', component: Blank, canActivate: [authGuard] },
          { path: 'private', component: Blank, canActivate: [authGuard] },
          { path: 'admin', component: Blank, canActivate: [authGuard, roleGuard('ORG_ADMIN')] },
          { path: 'governance', component: Blank, canActivate: [roleGuard('PMO', 'ORG_ADMIN')] },
        ]),
      ],
    });
  });

  afterEach(() => localStorage.clear());

  const go = async (url: string) => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  };

  it('sends anonymous users to sign-in with a return URL', async () => {
    expect(await go('/private?tab=2')).toBe('/login?returnUrl=%2Fprivate%3Ftab%3D2');
  });

  it('keeps signed-in users off the sign-in page', async () => {
    TestBed.inject(SessionStore).start(aSession());

    expect(await go('/login')).toBe('/dashboard');
    expect(await go('/private')).toBe('/private');
  });

  it('lets only the listed roles in, telling others why they bounced', async () => {
    const store = TestBed.inject(SessionStore);
    store.start(aSession()); // ORG_ADMIN in the first organization, PMO in the second

    expect(await go('/admin')).toBe('/admin');
    store.switchOrganization(store.memberships()[1].organizationId);
    expect(await go('/governance')).toBe('/governance');
    expect(await go('/admin')).toBe('/dashboard');
    expect(notifier.info).toHaveBeenCalledWith("You don't have permission to open that page.");
  });

  it('refuses role-guarded pages when there is no active role', async () => {
    expect(await go('/governance')).not.toBe('/governance');
    expect(notifier.info).toHaveBeenCalledOnce();
  });
});
