import { LiveAnnouncer } from '@angular/cdk/a11y';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { provideMockApi, resetMockApi, signInAs } from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { ORG_VIRUNGA } from '../../mocks/data';
import { SessionStore } from '../session/session.store';
import { AuthLayout } from './auth-layout';
import { visibleNavItems } from './nav-items';
import { OrgSwitcher } from './org-switcher';
import { Shell } from './shell';
import { UserMenu, initials } from './user-menu';

@Component({ template: '<h1 tabindex="-1">Page</h1>' })
class Page {}

describe('signed-in layout pieces', () => {
  const providers = () => [
    ...provideTestUi(),
    ...provideMockApi(),
    provideRouter([
      { path: 'login', component: Page },
      { path: 'dashboard', component: Page },
      { path: 'settings', component: Page },
    ]),
    {
      provide: BreakpointObserver,
      useValue: { observe: () => of({ matches: false, breakpoints: {} }) },
    },
  ];

  beforeEach(() => resetMockApi());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('navigation by role', () => {
    it('shows Administration only to organization admins', () => {
      expect(visibleNavItems('ORG_ADMIN').map((i) => i.label)).toContain('nav.admin');
      expect(visibleNavItems('PMO').map((i) => i.label)).not.toContain('nav.admin');
      expect(visibleNavItems(null).map((i) => i.label)).toEqual([
        'nav.dashboard',
        'nav.portfolios',
        'nav.projects',
        'nav.timesheets',
        'nav.resources',
        'nav.reports',
        'nav.settings',
      ]);
    });

    it('the shell follows the active role', async () => {
      await render(Shell, { providers: providers() });
      await signInAs('admin@kora.demo');
      const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
      await vi.waitFor(() =>
        expect(within(nav).getByRole('link', { name: 'Administration' })).toBeTruthy(),
      );

      TestBed.inject(SessionStore).switchOrganization(ORG_VIRUNGA); // PMO there
      await vi.waitFor(() =>
        expect(within(nav).queryByRole('link', { name: 'Administration' })).toBeNull(),
      );
    });
  });

  describe('OrgSwitcher', () => {
    it('shows the organization and role, and switches with an announcement', async () => {
      const announce = vi.spyOn(LiveAnnouncer.prototype, 'announce').mockResolvedValue();
      const view = await render(OrgSwitcher, { providers: providers() });
      await signInAs('admin@kora.demo');
      view.fixture.detectChanges();

      const trigger = await screen.findByRole('button', {
        // jsdom accessible-name computation trims inline text, so allow either spacing.
        name: /Organization:\s*Akagera Digital Ltd/,
      });
      expect(trigger.textContent).toContain('Administrator');
      await userEvent.click(trigger);
      const current = await screen.findByRole('menuitemradio', { name: /Akagera Digital Ltd/ });
      expect(current.getAttribute('aria-checked')).toBe('true');

      await userEvent.click(screen.getByRole('menuitemradio', { name: /Virunga Build Partners/ }));

      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/dashboard'));
      expect(TestBed.inject(SessionStore).activeRole()).toBe('PMO');
      expect(announce).toHaveBeenCalledWith('Switched to Virunga Build Partners', 'polite');
    });

    it('does nothing when the current organization is chosen again', async () => {
      const view = await render(OrgSwitcher, { providers: providers() });
      await signInAs('admin@kora.demo');
      view.fixture.detectChanges();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

      await userEvent.click(await screen.findByRole('button', { name: /Organization:/ }));
      await userEvent.click(await screen.findByRole('menuitemradio', { name: /Akagera/ }));

      expect(navigate).not.toHaveBeenCalled();
    });

    it('renders nothing when signed out', async () => {
      const { container } = await render(OrgSwitcher, { providers: providers() });

      expect(container.querySelector('button')).toBeNull();
    });
  });

  describe('UserMenu', () => {
    it('computes initials', () => {
      expect(initials('Aline Uwase')).toBe('AU');
      expect(initials('  marie  claire  uwineza ')).toBe('MC');
      expect(initials('')).toBe('');
    });

    it('shows who is signed in and signs out', async () => {
      const view = await render(UserMenu, { providers: providers() });
      await signInAs('pm@kora.demo');
      view.fixture.detectChanges();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Account menu for Grace Mukamana' }),
      );
      expect(await screen.findByText('pm@kora.demo')).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Settings' }).getAttribute('href')).toBe(
        '/settings',
      );

      await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/login'));
      expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(false);
    });
  });

  describe('AuthLayout', () => {
    it('frames public pages with brand, language and theme, and a working skip link', async () => {
      const view = await render(AuthLayout, { providers: providers() });
      await view.navigate('/login');

      expect(screen.getByRole('link', { name: 'Kora home' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Change language/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Change theme/ })).toBeTruthy();

      await userEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));
      expect(document.activeElement).toBe(await screen.findByRole('heading', { name: 'Page' }));
    });

    it('moves focus to the new heading after navigating between public pages', async () => {
      const view = await render(AuthLayout, { providers: providers() });
      await view.navigate('/login');

      await view.navigate('/settings');

      await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('H1'));
    });
  });
});
