import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../testing/mock-api';
import { openRoute } from '../../../testing/routes';
import { USER, kigaliDate } from '../../mocks/data';
import { db } from '../../mocks/db';
import { isoWeekOf, mondayOf, shiftWeek } from '../../shared/format/iso-week';
import { TIMESHEET_ROUTES } from './timesheets.routes';

const routes = [{ path: 'timesheets', children: TIMESHEET_ROUTES }];
const thisWeek = () => isoWeekOf(kigaliDate(Date.now()));

/** Opens a member's timesheet (this week by default) and waits for the grid. */
async function open(path = '', email = 'member@kora.demo') {
  const harness = await openRoute(routes, `/timesheets${path}`, email);
  await screen.findByRole('table', { name: 'Hours per task and day' }, { timeout: 5000 });
  return harness;
}

const cells = (task: string) => screen.getAllByRole('textbox', { name: new RegExp(`^${task}, `) });
const saved = () => screen.findByText('All changes saved.', {}, { timeout: 3000 });

describe('timesheets', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the week as tasks by days, with totals and the draft status', async () => {
    await open();

    expect(
      screen.getByRole('heading', { name: new RegExp(`Week ${thisWeek().slice(6)}`) }),
    ).toBeTruthy();
    const grid = screen.getByRole('table', { name: 'Hours per task and day' });
    expect(within(grid).getByRole('rowheader', { name: /AKG-001-49/ })).toBeTruthy();
    expect(within(grid).getByRole('rowheader', { name: /AKG-001-57/ })).toBeTruthy();
    expect((cells('AKG-001-49')[0] as HTMLInputElement).value).toBe('7');
    expect((cells('AKG-001-57')[1] as HTMLInputElement).value).toBe('7');
    const footer = within(grid).getByRole('rowheader', { name: 'Total per day' }).closest('tr');
    expect(footer?.textContent).toContain('14');
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
  });

  it('saves a draft while I type, with a decimal comma', async () => {
    await open();

    const wednesday = cells('AKG-001-49')[2];
    await userEvent.type(wednesday, '7,5');

    await saved();
    const entry = db.state.timeEntries.find(
      (e) => e.userId === USER.member && e.taskKey === 'AKG-001-49' && e.hours === 7.5,
    );
    expect(entry).toBeTruthy();
  });

  it('refuses hours that are not quarters, and days over 24 hours, without saving', async () => {
    await open();
    const before = db.state.timeEntries.length;

    const wednesday = cells('AKG-001-49')[2];
    await userEvent.type(wednesday, '7.3');
    expect(await screen.findByText('Enter hours in quarters from 0 to 24, like 7.5.')).toBeTruthy();
    expect(wednesday.getAttribute('aria-invalid')).toBe('true');

    await userEvent.clear(wednesday);
    await userEvent.type(wednesday, '20');
    await userEvent.type(cells('AKG-001-57')[2], '10');
    expect(
      await screen.findByText('A day can have at most 24 hours over all projects.'),
    ).toBeTruthy();
    expect(screen.getByText('over 24 hours')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit week' }).hasAttribute('disabled')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(db.state.timeEntries.length).toBe(before);
  });

  it('moves between cells with the arrow keys and Enter', async () => {
    await open();

    const [monday, tuesday] = cells('AKG-001-49');
    monday.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tuesday);
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(cells('AKG-001-57')[1]);
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}');
    expect(document.activeElement).toBe(monday);
  });

  it('submits the week after confirming, then shows it read-only', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Submit week' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit this week?' });
    expect(dialog.textContent).toContain('The week’s 14 h go to each project’s managers');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit week' }));

    expect(
      await screen.findByText(
        'This week is submitted: it can change only if a manager sends it back.',
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(
      db.state.timesheets.find(
        (s) =>
          s.userId === USER.member &&
          s.weekStart === mondayOf(kigaliDate(Date.now())) &&
          s.status === 'SUBMITTED',
      ),
    ).toBeTruthy();
  });

  it('opens a week from its address, read-only once submitted', async () => {
    await open(`/${shiftWeek(thisWeek(), -1)}`);

    expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'This week' })).toBeTruthy();
  });

  it('copies last week’s tasks into an empty week', async () => {
    await open(`/${shiftWeek(thisWeek(), 1)}`);
    expect(screen.getByText('No tasks yet. Add the tasks you worked on.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Copy last week’s tasks' }));

    await waitFor(() => expect(cells('AKG-001-49')).toHaveLength(7));
    expect(cells('AKG-001-57')).toHaveLength(7);
    expect((cells('AKG-001-49')[0] as HTMLInputElement).value).toBe('');
  });

  it('adds a task of a project in progress and focuses its first cell', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a task to the week' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Project' }));
    await userEvent.click(await screen.findByRole('option', { name: /AKG-001/ }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Task' }));
    const options = await screen.findAllByRole('option');
    // Tasks already in the week aren't offered again.
    expect(options.some((o) => o.textContent?.includes('AKG-001-49'))).toBe(false);
    const task = options[0].textContent?.match(/AKG-001-\d+/)?.[0] ?? '';
    await userEvent.click(options[0]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }));

    await waitFor(() => expect(document.activeElement).toBe(cells(task)[0]));
  });
});
