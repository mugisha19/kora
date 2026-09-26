import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideMockApi, resetMockApi } from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { SessionStore } from '../../core/session/session.store';
import { DEMO_PASSWORD } from '../../mocks/data';
import { db } from '../../mocks/db';
import { ForgotPasswordPage } from './forgot-password-page';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { ResetPasswordPage } from './reset-password-page';

@Component({ template: '<h1>Arrived</h1>' })
class Arrived {}

describe('auth pages', () => {
  const providers = () => [
    ...provideTestUi(),
    ...provideMockApi(),
    provideRouter(
      [
        { path: 'login', component: LoginPage },
        { path: 'register', component: RegisterPage },
        { path: 'forgot-password', component: ForgotPasswordPage },
        { path: 'reset-password', component: ResetPasswordPage },
        { path: '**', component: Arrived },
      ],
      withComponentInputBinding(),
    ),
  ];

  beforeEach(() => resetMockApi());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function open(url: string) {
    const view = await render('<router-outlet />', { providers: providers() });
    await view.navigate(url);
    await screen.findByRole('heading', { level: 1 });
    return view;
  }

  const type = async (label: string | RegExp, text: string) =>
    userEvent.type(screen.getByLabelText(label, { selector: 'input' }), text);

  describe('LoginPage', () => {
    it('shows one generic message for a wrong password or an unknown email', async () => {
      await open('/login');

      await type(/Email/, 'pm@kora.demo');
      await type(/^Password/, 'wrong');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Email or password is incorrect.',
      );

      await userEvent.clear(screen.getByLabelText(/Email/, { selector: 'input' }));
      await type(/Email/, 'nobody@kora.demo');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Email or password is incorrect.',
      );
    });

    it('validates before calling the API', async () => {
      await open('/login');

      await type(/Email/, 'not-an-email');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
      expect(screen.getByText('This field is required.')).toBeTruthy();
    });

    it('signs in and returns to a safe returnUrl', async () => {
      // Testing Library's navigate() passes query values through undecoded.
      await open('/login?returnUrl=/admin/members');

      await type(/Email/, 'admin@kora.demo');
      await type(/^Password/, DEMO_PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      await screen.findByRole('heading', { name: 'Arrived' });
      expect(TestBed.inject(Router).url).toBe('/admin/members');
      expect(TestBed.inject(SessionStore).activeRole()).toBe('ORG_ADMIN');
    });

    it('ignores an external returnUrl (open redirect)', async () => {
      await open('/login?returnUrl=https:%2F%2Fevil.example');

      await type(/Email/, 'pm@kora.demo');
      await type(/^Password/, DEMO_PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      await screen.findByRole('heading', { name: 'Arrived' });
      expect(TestBed.inject(Router).url).toBe('/dashboard');
    });

    it('explains an expired session', async () => {
      await open('/login?reason=expired');

      expect(screen.getByRole('status').textContent).toContain('Your session has expired.');
    });

    it('offers no demo buttons in builds without demo data', async () => {
      await open('/login');

      // Unit tests use the production environment file.
      expect(screen.queryByRole('heading', { name: 'Demo accounts' })).toBeNull();
    });
  });

  describe('RegisterPage', () => {
    it('shows the API error on the email field when the address is taken', async () => {
      await open('/register');

      await type(/Organization name/, 'Nyungwe Consulting');
      await type(/Full name/, 'Test Person');
      await type(/Email/, 'pm@kora.demo');
      await type(/^Password/, 'a long enough passphrase');
      await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

      expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
    });

    it('creates the organization and signs in as its administrator', async () => {
      await open('/register');

      await type(/Organization name/, '  Nyungwe Consulting ');
      await type(/Full name/, 'Test Person');
      await type(/Email/, 'owner@nyungwe.example');
      await type(/^Password/, 'a long enough passphrase');
      await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

      await screen.findByRole('heading', { name: 'Arrived' });
      const store = TestBed.inject(SessionStore);
      expect(store.activeMembership()).toMatchObject({
        organizationName: 'Nyungwe Consulting',
        role: 'ORG_ADMIN',
      });
    });

    it('checks password length locally', async () => {
      await open('/register');

      await type(/^Password/, 'short');
      await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

      expect(await screen.findByText('Must be at least 12 characters.')).toBeTruthy();
    });
  });

  describe('ForgotPasswordPage', () => {
    it('gives the same neutral confirmation whether or not the account exists', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      await open('/forgot-password');

      await type(/Email/, 'nobody@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

      expect((await screen.findByRole('status')).textContent).toContain(
        'If an account exists for nobody@example.com',
      );
      expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy();
    });
  });

  describe('ResetPasswordPage', () => {
    function issueToken(): string {
      db.state.resetTokens.push({
        token: 'reset-token-for-tests-0001',
        userId: db.userByEmail('pm@kora.demo')!.id,
        expiresAt: Date.now() + 60_000,
        used: false,
      });
      return 'reset-token-for-tests-0001';
    }

    it('without a token points to the forgot-password page', async () => {
      await open('/reset-password');

      expect(screen.getByRole('status').textContent).toContain('Open this page from the link');
      expect(screen.getByRole('link', { name: 'Request a new link' })).toBeTruthy();
    });

    it('requires matching passwords', async () => {
      await open(`/reset-password?token=${issueToken()}`);

      await type(/^New password/, 'a long enough passphrase');
      await type(/Confirm new password/, 'something else entirely');
      await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));

      expect(await screen.findByText("The passwords don't match.")).toBeTruthy();
    });

    it('sets the new password, then offers sign-in', async () => {
      await open(`/reset-password?token=${issueToken()}`);

      await type(/^New password/, 'a long enough passphrase');
      await type(/Confirm new password/, 'a long enough passphrase');
      await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));

      expect((await screen.findByRole('status')).textContent).toContain(
        'Your password has been changed',
      );
      expect(db.userByEmail('pm@kora.demo')!.password).toBe('a long enough passphrase');
    });

    it('offers a new link when the token is invalid or used', async () => {
      await open('/reset-password?token=reset-token-that-does-not-exist');

      await type(/^New password/, 'a long enough passphrase');
      await type(/Confirm new password/, 'a long enough passphrase');
      await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));

      expect((await screen.findByRole('alert')).textContent).toContain(
        'This reset link is invalid',
      );
      expect(screen.getByRole('link', { name: 'Request a new link' })).toBeTruthy();
    });
  });
});
