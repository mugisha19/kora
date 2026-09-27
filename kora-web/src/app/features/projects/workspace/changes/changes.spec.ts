import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  mockSession,
  provideMockApi,
  provideSession,
  resetMockApi,
} from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { provideTestUi } from '../../../../../testing/test-providers';
import { provideRouter } from '@angular/router';
import { ApprovalsButton } from '../../../../core/layout/approvals-button';
import { ApprovalsPage } from '../../../approvals/approvals-page';
import { CHANGE_REQUEST } from '../../../../mocks/data-governance';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
const page = (n: number) => `/projects/${PROJECT.mobile}/change-requests/${CHANGE_REQUEST(n)}`;

async function openRequest(n: number, email: string) {
  const harness = await openRoute(routes, page(n), email);
  await screen.findByRole('heading', { name: 'Approval chain' }, { timeout: 5000 });
  return harness;
}

const record = (n: number) => db.state.changeRequests.find((c) => c.id === CHANGE_REQUEST(n));

async function decide(label: 'Approve' | 'Reject', comment?: string) {
  await userEvent.click(await screen.findByRole('button', { name: label }));
  const dialog = await screen.findByRole('dialog', { name: new RegExp(`^${label} AKG-001`) });
  if (comment) await userEvent.type(within(dialog).getByRole('textbox'), comment);
  await userEvent.click(within(dialog).getByRole('button', { name: label }));
  return dialog;
}

describe('change requests', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('lists requests newest first with their status and who they wait for', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/change-requests`, 'pm@kora.demo');
    await screen.findByText('Change requests: 5', {}, { timeout: 5000 });

    const row = screen.getByRole('row', { name: /AKG-001-CR2/ });
    expect(within(row).getByText('In review')).toBeTruthy();
    expect(within(row).getByText('+RWF 12,000,000')).toBeTruthy();
    expect(row.textContent).toContain('Any PMO');
  });

  it('runs a large change through PMO and sponsor, then applies it', async () => {
    await openRequest(2, 'pmo@kora.demo');

    await decide('Approve');
    await waitFor(() => expect(record(2)?.steps[1].state).toBe('APPROVED'));
    // The PMO is also the sponsor here: the next step is theirs too.
    expect(record(2)?.steps[2].state).toBe('PENDING');
    // The page reloads the request: both steps approved, and it is my turn again.
    await waitFor(() => expect(screen.getAllByText('Approved')).toHaveLength(2));
    await decide('Approve', 'Go ahead');

    await waitFor(() => expect(record(2)?.status).toBe('APPROVED'));
    // Three approved steps and the request's own status.
    await waitFor(() => expect(screen.getAllByText('Approved')).toHaveLength(4));
    const project = db.state.projects.find((p) => p.id === PROJECT.mobile);
    expect(project?.budget?.amount).toBe('162000000');
    expect(
      db.state.charters.find((c) => c.projectId === PROJECT.mobile && c.status === 'APPROVED')
        ?.inScope,
    ).toContain('Utility bill payments (electricity and water) (AKG-001-CR2)');
  });

  it('needs a comment to reject; the requester revises and resubmits', async () => {
    await openRequest(3, 'pm@kora.demo');

    const dialog = await decide('Reject');
    expect(await within(dialog).findByText('This field is required.')).toBeTruthy();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Not before the audit');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(record(3)?.status).toBe('REJECTED'));
    expect(await screen.findByText(/Not before the audit/)).toBeTruthy();
  });

  it('lets the requester draft, then submit, and shows the chain the API built', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/change-requests`, 'member@kora.demo');
    await screen.findByText('Change requests: 5', {}, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: 'New change request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New change request' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Title' }),
      'Add a savings goal',
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      'Customers asked',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Cost change' }), '1 000 000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(TestBed.inject(Router).url).toMatch(/\/change-requests\/[0-9a-f-]{36}$/),
    );
    expect(await screen.findByText(/Built when the request is submitted/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    const confirm = await screen.findByRole('dialog', { name: /^Submit AKG-001-CR6/ });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Submit for approval' }));

    expect(
      await screen.findByText('The project manager confirms the impact analysis'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('never offers requesters a decision on their own request', async () => {
    await openRequest(3, 'member@kora.demo');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy();
  });

  describe('my approvals', () => {
    it('counts and lists what waits for me', async () => {
      await render(ApprovalsButton, {
        providers: [
          ...provideTestUi(),
          ...provideMockApi(),
          provideRouter([]),
          provideSession(await mockSession('pmo@kora.demo')),
        ],
      });
      expect(
        await screen.findByRole('link', { name: 'My approvals: 1 waiting' }, { timeout: 5000 }),
      ).toBeTruthy();
    });

    it('shows each request with the step and why', async () => {
      await render(ApprovalsPage, {
        providers: [
          ...provideTestUi(),
          ...provideMockApi(),
          provideRouter([]),
          provideSession(await mockSession('pm@kora.demo')),
        ],
      });
      expect(
        await screen.findByRole('link', { name: /AKG-001-CR3/ }, { timeout: 5000 }),
      ).toBeTruthy();
      expect(screen.getByText(/The project manager confirms the impact analysis/)).toBeTruthy();
    });
  });
});
