import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { provideMockApi, resetMockApi, signInAs } from '../testing/mock-api';
import { provideTestUi } from '../testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

describe('App routes', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  async function setup() {
    return render(App, {
      providers: [...provideTestUi(), ...provideMockApi(), provideRouter(routes)],
    });
  }

  it('sends anonymous visitors to sign-in, remembering where they were going', async () => {
    const { navigate } = await setup();

    await navigate('/settings');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fsettings');
  });

  it('shows the shell and the dashboard once signed in', async () => {
    const { navigate } = await setup();
    await signInAs('pm@kora.demo');

    await navigate('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  });

  it('keeps signed-in users away from sign-in pages', async () => {
    const { navigate } = await setup();
    await signInAs('pm@kora.demo');

    await navigate('/register');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('turns non-admins away from /admin with a message', async () => {
    const { navigate } = await setup();
    await signInAs('viewer@kora.demo');

    await navigate('/admin/members');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(await screen.findByText("You don't have permission to open that page.")).toBeTruthy();
  });

  it('shows the not-found page for unknown URLs when signed in', async () => {
    const { navigate } = await setup();
    await signInAs('pm@kora.demo');

    await navigate('/nowhere');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  });
});
