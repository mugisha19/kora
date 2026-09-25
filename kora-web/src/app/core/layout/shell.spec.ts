import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { BehaviorSubject } from 'rxjs';
import { provideTestUi } from '../../../testing/test-providers';
import { PageHeader } from '../../shared/ui/page-header';
import { Shell } from './shell';

@Component({ imports: [PageHeader], template: `<kora-page-header heading="Dashboard" />` })
class DashboardStub {}

@Component({ imports: [PageHeader], template: `<kora-page-header heading="Settings" />` })
class SettingsStub {}

describe('Shell', () => {
  async function setup(handset: boolean) {
    const breakpoint = new BehaviorSubject<BreakpointState>({ matches: handset, breakpoints: {} });
    const view = await render(Shell, {
      providers: [
        ...provideTestUi(),
        provideRouter([
          { path: 'dashboard', component: DashboardStub },
          { path: 'settings', component: SettingsStub },
        ]),
        { provide: BreakpointObserver, useValue: { observe: () => breakpoint } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/dashboard');
    await view.fixture.whenStable();
    return view;
  }

  it('has a skip link, a labelled main navigation and marks the current page', async () => {
    await setup(false);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Kora home' })).toBeTruthy();
    // Desktop: navigation is always visible, so there is no menu button.
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).toBeNull();
  });

  it('skip link moves focus to the page heading without navigating', async () => {
    await setup(false);

    await userEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Dashboard' }),
    );
    expect(TestBed.inject(Router).url).toBe('/dashboard');
  });

  it('moves focus to the new page heading after navigation', async () => {
    const { fixture } = await setup(false);

    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
    await fixture.whenStable();

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    );
  });

  it('on small screens opens the drawer from the toolbar and closes it after navigating', async () => {
    const { fixture } = await setup(true);
    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(menuButton);
    await fixture.whenStable();
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');

    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
    await fixture.whenStable();

    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1, name: 'Settings' }),
      ),
    );
  });
});
