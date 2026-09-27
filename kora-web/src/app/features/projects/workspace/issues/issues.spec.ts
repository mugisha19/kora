import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { ISSUE } from '../../../../mocks/data-governance';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

async function open(path = '', email = 'pm@kora.demo') {
  const harness = await openRoute(routes, `/projects/${PROJECT.mobile}/issues${path}`, email);
  await screen.findByText(/^Issues: \d+$/, {}, { timeout: 5000 });
  return harness;
}

const log = () => screen.getByRole('table', { name: 'Issue log' });
const status = (n: number) => db.state.issues.find((i) => i.id === ISSUE(n))?.status;

describe('issues', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('lists the most urgent first, marking overdue and escalated issues in words', async () => {
    await open();

    const first = within(log()).getAllByRole('row')[1];
    expect(first.textContent).toContain('AKG-001-I2');
    expect(within(first).getByText('Escalated to the PMO')).toBeTruthy();
    expect(within(first).getByText('Overdue')).toBeTruthy();
  });

  it('narrows the log with the quick filters', async () => {
    await open();

    const overdue = screen.getByRole('button', { name: 'Overdue', pressed: false });
    await userEvent.click(overdue);
    await waitFor(() => expect(screen.getByText('Issues: 1')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Overdue', pressed: true })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Overdue', pressed: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Mine', pressed: false }));
    await waitFor(() => expect(screen.getByText('Issues: 3')).toBeTruthy());
  });

  it('needs a resolution to resolve, then the manager closes and reopens', async () => {
    await open(`/${ISSUE(2)}`);
    const sheet = await screen.findByRole('dialog', { name: /AKG-001-I2/ }, { timeout: 5000 });

    await userEvent.click(within(sheet).getByRole('button', { name: 'Resolve' }));
    const resolve = await screen.findByRole('dialog', { name: 'Resolve AKG-001-I2' });
    await userEvent.click(within(resolve).getByRole('button', { name: 'Resolve' }));
    expect(await within(resolve).findByText('This field is required.')).toBeTruthy();
    await userEvent.type(within(resolve).getByRole('textbox'), 'Switched to the backup region.');
    await userEvent.click(within(resolve).getByRole('button', { name: 'Resolve' }));

    await waitFor(() => expect(status(2)).toBe('RESOLVED'));
    expect(await within(sheet).findByText('Switched to the backup region.')).toBeTruthy();

    await userEvent.click(await within(sheet).findByRole('button', { name: 'Close issue' }));
    const confirm = await screen.findByRole('dialog', { name: 'Close AKG-001-I2?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Close issue' }));
    await waitFor(() => expect(status(2)).toBe('CLOSED'));
    // The sheet reloads the issue before offering what a closed issue allows.
    await within(sheet).findByText('Closed', {}, { timeout: 3000 });

    await userEvent.click(await within(sheet).findByRole('button', { name: 'Reopen' }));
    const reopen = await screen.findByRole('dialog', { name: 'Reopen AKG-001-I2' });
    await userEvent.type(within(reopen).getByRole('textbox'), 'It happened again');
    await userEvent.click(within(reopen).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(status(2)).toBe('OPEN'));
  });

  it('raises a change request from an issue and opens it', async () => {
    await open(`/${ISSUE(1)}`, 'member@kora.demo');
    const sheet = await screen.findByRole('dialog', { name: /AKG-001-I1/ }, { timeout: 5000 });

    await userEvent.click(within(sheet).getByRole('button', { name: 'Raise a change request' }));
    const dialog = await screen.findByRole('dialog', { name: 'New change request' });
    expect(within(dialog).getByText('For issue AKG-001-I1.')).toBeTruthy();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Title' }),
      'Support Android 10',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Many customers');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(TestBed.inject(Router).url).toMatch(/\/change-requests\/[0-9a-f-]{36}$/),
    );
    const request = db.state.changeRequests.find((c) => c.title === 'Support Android 10');
    expect(request).toMatchObject({ status: 'DRAFT', issueId: ISSUE(1) });
  });

  it('shows the sheet without actions to someone who only reads', async () => {
    await open(`/${ISSUE(4)}`, 'viewer@kora.demo');
    const sheet = await screen.findByRole('dialog', { name: /AKG-001-I4/ }, { timeout: 5000 });
    expect(await within(sheet).findByText('The change request raised for it')).toBeTruthy();
    expect(within(sheet).queryByRole('button', { name: 'Resolve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Raise issue' })).toBeNull();
  });
});
