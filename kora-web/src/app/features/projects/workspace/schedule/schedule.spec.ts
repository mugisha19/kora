import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { USER } from '../../../../mocks/data';
import { PROJECT } from '../../../../mocks/data-projects';
import { WAREHOUSE_TASK } from '../../../../mocks/data-schedule';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

/** Opens the warehouse project's schedule and waits for it to load. */
async function open(query = '', email = 'pm@kora.demo') {
  const harness = await openRoute(routes, `/projects/${PROJECT.warehouse}/schedule${query}`, email);
  await screen.findByText('Finishes', {}, { timeout: 5000 });
  return harness;
}

/** A task's row (other rows mention it as a predecessor). */
const row = (key: string) =>
  screen.getByRole('rowheader', { name: new RegExp(`^${key} `) }).closest('tr') as HTMLElement;
const task = (n: number) => db.state.tasks.find((t) => t.id === WAREHOUSE_TASK(n));

describe('schedule', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the Gantt with the critical path marked in words, not only colour', async () => {
    await open();

    const chart = screen.getByRole('img', { name: /Gantt chart of 8 tasks/ });
    expect(chart.getAttribute('aria-label')).toContain('with 7 on the critical path');
    expect(screen.getByText('7 tasks')).toBeTruthy();
    expect(screen.getAllByText('Critical')).toHaveLength(7);
    expect(screen.getByText(/No. 1, saved .* by Grace Mukamana/)).toBeTruthy();
    // Managers edit: the chart explains how, and the toolbar offers the rest.
    expect(screen.getByText(/Drag a bar to move it/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save baseline' })).toBeTruthy();
  });

  it('lists every figure in the table view, with the baseline variance', async () => {
    await open('?view=table');

    const legal = row('AKG-005-3');
    expect(within(legal).getByText('10 d')).toBeTruthy();
    expect(within(legal).getByText('4 d late')).toBeTruthy();
    expect(within(legal).getByText('AKG-005-2')).toBeTruthy();
    const finance = row('AKG-005-4');
    expect(within(finance).getByText('Has float')).toBeTruthy();
    expect(within(finance).getByText('SS+3')).toBeTruthy();
    expect(within(row('AKG-005-8')).getByText('Milestone')).toBeTruthy();
  });

  it('edits a duration from the table and reschedules', async () => {
    await open('?view=table');

    await userEvent.click(screen.getByRole('button', { name: 'Edit the schedule of AKG-005-4' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule of AKG-005-4' });
    const duration = within(dialog).getByRole('textbox', { name: 'Duration (working days)' });
    await userEvent.clear(duration);
    await userEvent.type(duration, '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(within(row('AKG-005-4')).getByText('20 d')).toBeTruthy());
    expect(task(4)?.durationDays).toBe(20);
    // Twenty days is more than its float: the finance mart is now on the critical path.
    expect(within(row('AKG-005-4')).getByText('Critical')).toBeTruthy();
  });

  it('asks for the date of a start-no-earlier-than constraint', async () => {
    await open('?view=table');

    await userEvent.click(screen.getByRole('button', { name: 'Edit the schedule of AKG-005-1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule of AKG-005-1' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Start no earlier than' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('This field is required.')).toBeTruthy();
    expect(task(1)?.scheduleConstraint).toBeUndefined();
  });

  it('names the chain when a new dependency would close a loop', async () => {
    await open('?view=table');

    await userEvent.click(screen.getByRole('button', { name: 'Add a predecessor to AKG-005-2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a dependency' });
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Predecessor (comes first)' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: /AKG-005-7/ }));
    expect(
      within(dialog).getByText('AKG-005-2 can start once AKG-005-7 has finished.'),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add dependency' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain(
      'AKG-005-7 → AKG-005-2 → AKG-005-4 → AKG-005-6 → AKG-005-7',
    );
    expect(db.state.dependencies).toHaveLength(10);
  });

  it('adds a dependency with a lead and removes one', async () => {
    await open('?view=table');

    await userEvent.click(screen.getByRole('button', { name: 'Add a predecessor to AKG-005-7' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a dependency' });
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Predecessor (comes first)' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: /AKG-005-4/ }));
    const lag = within(dialog).getByRole('textbox', { name: 'Lag' });
    await userEvent.clear(lag);
    await userEvent.type(lag, '-2');
    expect(within(dialog).getByText(/2 working days earlier/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add dependency' }));

    await waitFor(() => expect(within(row('AKG-005-7')).getByText('FS−2')).toBeTruthy());

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the link AKG-005-1 → AKG-005-2' }),
    );
    await waitFor(() => expect(within(row('AKG-005-2')).queryByText('AKG-005-1')).toBeNull());
    expect(await screen.findByText('Removed the link AKG-005-1 → AKG-005-2.')).toBeTruthy();
  });

  it('saves a new baseline after confirming', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Save baseline' }));
    const confirm = await screen.findByRole('dialog', { name: 'Save baseline 2?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Save baseline' }));

    expect(await screen.findByText(/No. 2, saved/)).toBeTruthy();
  });

  it('is read-only for someone who does not manage the project', async () => {
    db.state.projectMembers.push({
      projectId: PROJECT.warehouse,
      userId: USER.member,
      projectRole: 'OBSERVER',
      addedAt: '2026-09-01T08:00:00Z',
    });
    await open('?view=table', 'member@kora.demo');

    expect(row('AKG-005-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save baseline' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add dependency' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit the schedule of/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove the link/ })).toBeNull();
  });

  it('adds the schedule fields to the task sheet of a Predictive project', async () => {
    await open('?view=table');

    await userEvent.click(within(row('AKG-005-8')).getByRole('button', { name: /^AKG-005-8 / }));
    const sheet = await screen.findByRole('dialog', { name: /First data mart live/ });
    expect(within(sheet).getByText('Duration (working days)')).toBeTruthy();
    expect(within(sheet).getByText('Milestone')).toBeTruthy();
    expect(within(sheet).getByText('As soon as possible')).toBeTruthy();
  });
});
