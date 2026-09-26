import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideMockApi, resetMockApi } from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { SessionStore } from '../../core/session/session.store';
import { DEMO_INVITATION_TOKENS, DEMO_PASSWORD, ORG_VIRUNGA } from '../../mocks/data';
import { AcceptInvitationPage } from './accept-invitation-page';

@Component({ template: '<h1>Dashboard</h1>' })
class Dashboard {}

describe('AcceptInvitationPage', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  async function open(token: string) {
    const view = await render('<router-outlet />', {
      providers: [
        ...provideTestUi(),
        ...provideMockApi(),
        provideRouter(
          [
            { path: 'invitations/:token', component: AcceptInvitationPage },
            { path: '**', component: Dashboard },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    await view.navigate(`/invitations/${token}`);
    return view;
  }

  it('previews an invitation for a new person and creates their account', async () => {
    await open(DEMO_INVITATION_TOKENS.newAccount);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Join Akagera Digital Ltd' }),
    ).toBeTruthy();
    expect(screen.getByText('Aline Uwase invited you to join as Member.')).toBeTruthy();
    expect(screen.getByText('new.person@example.com')).toBeTruthy();

    await userEvent.type(screen.getByLabelText(/Full name/, { selector: 'input' }), 'New Person');
    await userEvent.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account and join' }));
    expect(await screen.findByText('Must be at least 12 characters.')).toBeTruthy();

    await userEvent.type(
      screen.getByLabelText(/^Password/, { selector: 'input' }),
      ' but now long enough',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create account and join' }));

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(TestBed.inject(SessionStore).user()?.fullName).toBe('New Person');
    expect(TestBed.inject(Router).url).toBe('/dashboard');
  });

  it('asks an existing account only for its password, then opens the new organization', async () => {
    await open(DEMO_INVITATION_TOKENS.existingAccount);

    await screen.findByRole('heading', { level: 1, name: 'Join Virunga Build Partners' });
    expect(screen.queryByLabelText(/Full name/)).toBeNull();

    await userEvent.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Email or password is incorrect.',
    );

    await userEvent.clear(screen.getByLabelText(/^Password/, { selector: 'input' }));
    await userEvent.type(screen.getByLabelText(/^Password/, { selector: 'input' }), DEMO_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(TestBed.inject(SessionStore).activeOrganizationId()).toBe(ORG_VIRUNGA);
  });

  it.each([
    [DEMO_INVITATION_TOKENS.expired, 'This invitation has expired. Ask for a new one.'],
    ['demo-invite-revoked-0006', 'This invitation was cancelled.'],
    ['no-such-invitation-token', "This invitation link isn't valid."],
  ])('explains why %s cannot be used', async (token, message) => {
    await open(token);

    expect(
      await screen.findByRole('heading', { level: 1, name: "This invitation can't be used" }),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(message);
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toBeTruthy();
  });
});
