import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../testing/mock-api';
import { openRoute } from '../../../testing/routes';
import { USER } from '../../mocks/data';
import { PROJECT } from '../../mocks/data-projects';
import { db } from '../../mocks/db';

const routes = [
  {
    path: 'resources',
    loadComponent: () => import('./resources-page').then((m) => m.ResourcesPage),
  },
];

/** Opens the heat map and waits for its table. */
async function open(email: string, query = '') {
  const harness = await openRoute(routes, `/resources${query}`, email);
  await screen.findByRole(
    'table',
    { name: 'Planned hours as a share of capacity, per person and week' },
    { timeout: 5000 },
  );
  return harness;
}

const heatmap = () =>
  screen.getByRole('table', { name: 'Planned hours as a share of capacity, per person and week' });
/** A person's row of cells (without the name). */
const cellsOf = (name: string) =>
  within(within(heatmap()).getByRole('button', { name }).closest('tr') as HTMLElement).getAllByRole(
    'cell',
  );
const sheet = (name: string) => screen.findByRole('dialog', { name }, { timeout: 5000 });

describe('resources', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the organization week by week, with bands in words and the hours behind them', async () => {
    await open('pmo@kora.demo');

    expect(within(heatmap()).getAllByRole('columnheader')).toHaveLength(13);
    const grace = cellsOf('Grace Mukamana');
    // A third project from the fourth week puts the project manager over capacity.
    expect(grace[0].textContent).toContain('80%');
    expect(grace[0].textContent).toContain('Healthy');
    expect(grace[4].textContent).toContain('120%');
    expect(grace[4].textContent).toContain('Over');
    expect(grace[4].textContent).toContain('48 h planned of 40 h capacity');
    // Odette works 32 hours a week.
    expect(cellsOf('Odette Mukamurenzi')[0].textContent).toContain('28 h planned of 32 h capacity');
    expect(screen.getByRole('list', { name: 'Utilization bands' }).textContent).toContain(
      'above 100%',
    );
  });

  it('narrows to a project’s team and to fewer weeks from the address', async () => {
    await open('pm@kora.demo', `?project=${PROJECT.mobile}&weeks=4`);

    expect(within(heatmap()).getAllByRole('columnheader')).toHaveLength(5);
    const people = within(heatmap())
      .getAllByRole('rowheader')
      .map((h) => h.textContent?.trim());
    expect(people).toEqual(
      expect.arrayContaining(['Grace Mukamana', 'Eric Nshimiyimana', 'Odette Mukamurenzi']),
    );
    expect(people).not.toContain('Alice Umutoni');
  });

  it('shows a member only themself, and lets them record their own leave', async () => {
    await open('member@kora.demo');

    expect(screen.queryByRole('combobox', { name: 'Team' })).toBeNull();
    expect(within(heatmap()).getAllByRole('rowheader')).toHaveLength(1);
    await userEvent.click(within(heatmap()).getByRole('button', { name: 'Eric Nshimiyimana' }));
    const dialog = await sheet('Eric Nshimiyimana');

    expect(await within(dialog).findByText('40 h a week')).toBeTruthy();
    expect(within(dialog).getByText(/Family event/)).toBeTruthy();
    expect(within(dialog).queryByRole('heading', { name: 'Cost rates' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Change hours' })).toBeNull();

    const leaveBefore = db.state.leave.length;
    await userEvent.type(within(dialog).getByLabelText('From'), '2026-12-24');
    await userEvent.type(within(dialog).getByLabelText('To'), '2026-12-31');
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Christmas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add leave' }));

    expect(await within(dialog).findByText(/Christmas/, {}, { timeout: 3000 })).toBeTruthy();
    expect(db.state.leave.length).toBe(leaveBefore + 1);
  });

  it('refuses leave that ends before it starts', async () => {
    await open('member@kora.demo');
    await userEvent.click(within(heatmap()).getByRole('button', { name: 'Eric Nshimiyimana' }));
    const dialog = await sheet('Eric Nshimiyimana');
    await within(dialog).findByText('40 h a week');

    await userEvent.type(within(dialog).getByLabelText('From'), '2026-12-24');
    await userEvent.type(within(dialog).getByLabelText('To'), '2026-12-20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add leave' }));

    expect(await within(dialog).findByText('The end can’t be before the start.')).toBeTruthy();
  });

  it('shows cost rates only to the PMO and administrators, who can add one', async () => {
    await open('pmo@kora.demo');
    await userEvent.click(within(heatmap()).getByRole('button', { name: 'Eric Nshimiyimana' }));
    const dialog = await sheet('Eric Nshimiyimana');

    const rates = await within(dialog).findByRole('region', { name: 'Cost rates' });
    await waitFor(() => expect(rates.textContent).toContain('18,000'));
    expect(rates.textContent).toContain('16,000');
    await userEvent.type(within(rates).getByLabelText('Hourly rate'), '20000');
    await userEvent.type(within(rates).getByLabelText('From'), '2027-01-01');
    await userEvent.click(within(rates).getByRole('button', { name: 'Add rate' }));

    await waitFor(() => expect(rates.textContent).toContain('20,000'), { timeout: 3000 });
    expect(
      db.state.costRates.some((r) => r.userId === USER.member && r.hourlyRate.amount === '20000'),
    ).toBe(true);
  });

  it('lets a project manager look at a person without changing their capacity or leave', async () => {
    await open('pm@kora.demo');
    await userEvent.click(within(heatmap()).getByRole('button', { name: 'Odette Mukamurenzi' }));
    const dialog = await sheet('Odette Mukamurenzi');

    expect(await within(dialog).findByText('32 h a week')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Add leave' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Cancel the leave/ })).toBeNull();
    expect(within(dialog).queryByRole('region', { name: 'Cost rates' })).toBeNull();
  });
});
