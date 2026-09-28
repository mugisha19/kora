import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { USER } from '../../../../mocks/data';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { plusDays } from '../../../../shared/format/iso-week';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

/** Opens the mobile app's time tab and waits for the planned-hours grid. */
async function open(email = 'pm@kora.demo') {
  const harness = await openRoute(routes, `/projects/${PROJECT.mobile}/time`, email);
  await screen.findByRole(
    'table',
    { name: 'Planned hours per person and week, with utilization' },
    { timeout: 5000 },
  );
  return harness;
}

const approvals = () => screen.getByRole('region', { name: 'Timesheets to approve' });
const plan = (name: string) =>
  screen.getAllByRole('textbox', { name: new RegExp(`^${name}, week of .*, planned hours$`) });
const lastWeek = (userId: string) =>
  db.state.timesheets
    .filter((s) => s.userId === userId && s.projectId === PROJECT.mobile)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .find((s) => s.status !== 'DRAFT');

describe('time tab', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('lists submitted weeks; the manager’s own week goes to the PMO', async () => {
    await open();
    await within(approvals()).findByText('Eric Nshimiyimana', {}, { timeout: 3000 });

    expect(
      within(approvals()).getByRole('button', {
        name: 'Approve the timesheet of Eric Nshimiyimana',
      }),
    ).toBeTruthy();
    expect(within(approvals()).getByText('35 h')).toBeTruthy();
    expect(within(approvals()).getByText('Your own time: the PMO approves it.')).toBeTruthy();
    expect(
      within(approvals()).queryByRole('button', {
        name: 'Approve the timesheet of Grace Mukamana',
      }),
    ).toBeNull();
  });

  it('approves a week', async () => {
    await open();
    await userEvent.click(
      await within(approvals()).findByRole(
        'button',
        { name: 'Approve the timesheet of Eric Nshimiyimana' },
        { timeout: 3000 },
      ),
    );

    await waitFor(() => expect(lastWeek(USER.member)?.status).toBe('APPROVED'));
    await waitFor(() => expect(within(approvals()).queryByText('Eric Nshimiyimana')).toBeNull());
  });

  it('sends a week back only with a comment', async () => {
    await open();
    await userEvent.click(
      await within(approvals()).findByRole(
        'button',
        { name: 'Send back the timesheet of Eric Nshimiyimana' },
        { timeout: 3000 },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: /Send back week \d+ of Eric/ });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'What needs to change?' }),
      'Tuesday belongs to the card story.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));

    await waitFor(() => expect(lastWeek(USER.member)?.status).toBe('REJECTED'));
    expect(lastWeek(USER.member)?.comment).toBe('Tuesday belongs to the card story.');
  });

  it('flags a long week for the approver', async () => {
    const sheet = lastWeek(USER.member);
    for (const entry of db.state.timeEntries)
      if (
        entry.userId === USER.member &&
        entry.projectId === PROJECT.mobile &&
        sheet &&
        entry.date >= sheet.weekStart &&
        entry.date <= plusDays(sheet.weekStart, 6)
      )
        entry.hours = 11;
    await open();

    expect(await within(approvals()).findByText('Over 50 h', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('previews utilization over all projects before saving planned hours', async () => {
    await open();

    // The second week, Eric is on leave three days: 35 planned hours of 16.
    const cell = plan('Eric Nshimiyimana')[1] as HTMLInputElement;
    expect(cell.value).toBe('35');
    await waitFor(() => expect(cell.closest('td')?.textContent).toContain('219%'));
    expect(screen.queryByText(/Changes not saved yet/)).toBeNull();

    await userEvent.clear(cell);
    await userEvent.type(cell, '16');
    expect(cell.closest('td')?.textContent).toContain('100%');
    expect(cell.closest('td')?.textContent).toContain('Healthy');
    expect(screen.getByText('Changes not saved yet (preview): 1')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect((plan('Eric Nshimiyimana')[1] as HTMLInputElement).value).toBe('35'),
    );

    const again = plan('Eric Nshimiyimana')[1];
    await userEvent.clear(again);
    await userEvent.type(again, '16');
    await userEvent.click(screen.getByRole('button', { name: 'Save planned hours' }));

    await waitFor(() => expect(screen.queryByText(/Changes not saved yet/)).toBeNull(), {
      timeout: 3000,
    });
    expect(
      db.state.allocations.some(
        (a) => a.userId === USER.member && a.projectId === PROJECT.mobile && a.hours === 16,
      ),
    ).toBe(true);
  });

  it('refuses more hours than a week has', async () => {
    await open();

    const cell = plan('Odette Mukamurenzi')[0];
    await userEvent.clear(cell);
    await userEvent.type(cell, '200');
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Save planned hours' }));

    expect(await screen.findByText('Enter hours from 0 to 168.')).toBeTruthy();
  });

  it('shows a viewer the plan without approvals or editing', async () => {
    await open('viewer@kora.demo');

    expect(screen.queryByRole('region', { name: 'Timesheets to approve' })).toBeNull();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save planned hours' })).toBeNull();
  });
});
