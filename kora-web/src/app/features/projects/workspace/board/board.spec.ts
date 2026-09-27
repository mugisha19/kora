import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
/** Opens the board and waits for it: a lazy route, then the sprints, then the board itself. */
async function open(email = 'pm@kora.demo', query = '') {
  const harness = await openRoute(routes, `/projects/${PROJECT.mobile}/board${query}`, email);
  await screen.findByRole('region', { name: 'In progress' }, { timeout: 5000 });
  return harness;
}

const column = (name: RegExp | string) => screen.getByRole('region', { name });
const cardKeys = (region: HTMLElement) =>
  within(region)
    .queryAllByText(/^AKG-001-\d+$/)
    .map((el) => el.textContent);
const status = (key: string) =>
  db.state.tasks.find((t) => t.projectId === PROJECT.mobile && `AKG-001-${t.number}` === key)
    ?.status;

describe('board', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the active sprint in columns with WIP counts', async () => {
    await open();

    const inProgress = screen.getByRole('region', { name: 'In progress' });
    expect(within(inProgress).getByText('3 / 3')).toBeTruthy();
    expect(within(inProgress).getByText('At limit')).toBeTruthy();
    expect(cardKeys(column('To do'))).toEqual(['AKG-001-48', 'AKG-001-49']);
    // A renamed column keeps its name; default names are translated.
    expect(screen.getByRole('region', { name: 'Code review' })).toBeTruthy();
    expect(screen.getByText('Waiting for the external pen-test report')).toBeTruthy();
  });

  it('moves a card with the keyboard menu and announces where it went', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-49' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

    await waitFor(() => expect(cardKeys(column('To do'))).toEqual(['AKG-001-49', 'AKG-001-48']));
    await waitFor(
      () =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Move AKG-001-49' }),
        ),
      { timeout: 3000 },
    );
  });

  it('asks before exceeding a WIP limit and moves anyway when confirmed', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-48' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to In progress' }));
    const confirm = await screen.findByRole('dialog', { name: 'Column at its limit' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Move anyway' }));

    await waitFor(() => expect(status('AKG-001-48')).toBe('IN_PROGRESS'));
    await waitFor(() => expect(within(column('In progress')).getByText('4 / 3')).toBeTruthy());
    expect(within(column('In progress')).getByText('Over limit')).toBeTruthy();
  });

  it('snaps the card back when the move is cancelled', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-48' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to In progress' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Column at its limit' })).getByRole(
        'button',
        {
          name: 'Cancel',
        },
      ),
    );

    await waitFor(() => expect(cardKeys(column('To do'))).toContain('AKG-001-48'));
    expect(status('AKG-001-48')).toBe('TODO');
  });

  it('asks why a task is blocked', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-49' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to Blocked' }));
    const dialog = await screen.findByRole('dialog', { name: 'Why is AKG-001-49 blocked?' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Waiting for the new SDK');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(status('AKG-001-49')).toBe('BLOCKED'));
    expect(await within(column('Blocked')).findByText('Waiting for the new SDK')).toBeTruthy();
  });

  it('only offers the moves the lifecycle allows', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-43' })); // in review
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent?.trim());
    expect(items).toEqual(['Move up', 'Move down', 'Move to In progress', 'Move to Done']);
  });

  it('lets a viewer read the board but not move or create', async () => {
    await open('viewer@kora.demo');

    expect(screen.queryByRole('button', { name: /^Move AKG/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Settings of/ })).toBeNull();
  });

  it('lets a contributor move only their own or unassigned tasks', async () => {
    await open('member@kora.demo');

    expect(screen.getByRole('button', { name: 'Move AKG-001-46' })).toBeTruthy(); // theirs
    expect(screen.getByRole('button', { name: 'Move AKG-001-48' })).toBeTruthy(); // nobody's
    expect(screen.queryByRole('button', { name: 'Move AKG-001-44' })).toBeNull(); // Odette's
  });

  it('filters from the URL and groups by assignee', async () => {
    await open('pm@kora.demo', '?type=BUG');
    expect(screen.getAllByText(/^AKG-001-\d+$/).map((k) => k.textContent)).toEqual(['AKG-001-45']);

    await userEvent.click(screen.getByRole('switch', { name: 'Swimlanes by assignee' }));
    await waitFor(() =>
      expect(TestBed.inject(Router).url).toBe(
        `/projects/${PROJECT.mobile}/board?type=BUG&lanes=assignee`,
      ),
    );
    expect(await screen.findByRole('region', { name: 'Grace Mukamana' })).toBeTruthy();
  });

  it('shows every task when asked, not only the sprint', async () => {
    await open('pm@kora.demo', '?sprint=all');

    const todo = await screen.findByRole('region', { name: 'To do' });
    await waitFor(() => expect(cardKeys(todo)).toContain('AKG-001-57'));
  });

  it('lets a manager set a column WIP limit', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Settings of Blocked' }));
    const dialog = await screen.findByRole('dialog', { name: 'Column settings' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'WIP limit' }), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(within(column('Blocked')).getByText('1 / 1')).toBeTruthy());
    expect(within(column('Blocked')).getByText('At limit')).toBeTruthy();
  });

  it('creates a task in the sprint shown', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'New task' }));
    const sheet = await screen.findByRole('dialog', { name: 'New task' });
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Title' }),
      'Store tokens in the keychain',
    );
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Story points' }), '3');
    await userEvent.click(within(sheet).getByRole('button', { name: 'New task' }));

    await waitFor(() =>
      expect(within(column('To do')).getByText('Store tokens in the keychain')).toBeTruthy(),
    );
    expect(db.state.tasks.find((t) => t.title === 'Store tokens in the keychain')).toMatchObject({
      status: 'TODO',
      sprintId: expect.any(String),
      storyPoints: 3,
    });
  });

  it('opens a task, shows its Markdown and comments, and lets a contributor comment', async () => {
    await open('member@kora.demo');

    await userEvent.click(screen.getByRole('button', { name: 'Two-step sign-in with SMS codes' }));
    const sheet = await screen.findByRole('dialog', { name: /Two-step sign-in with SMS codes/ });
    expect(within(sheet).getByText('5 minutes').tagName).toBe('STRONG');
    expect(await within(sheet).findByText(/Ready for review/)).toBeTruthy();

    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Add a comment' }),
      'Looks good',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Comment' }));
    expect(await within(sheet).findByText('Looks good')).toBeTruthy();
  });

  it('edits a task and reports remaining work before it can finish', async () => {
    await open('member@kora.demo');

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-43' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to Done' }));
    expect(
      await screen.findByText('Set the remaining hours to 0 before finishing the task.', {
        exact: false,
      }),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Two-step sign-in with SMS codes' }));
    const sheet = await screen.findByRole('dialog', { name: /Two-step sign-in/ });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Edit' }));
    const remaining = within(sheet).getByRole('textbox', { name: 'Remaining' });
    await userEvent.clear(remaining);
    await userEvent.type(remaining, '0');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await within(sheet).findByText('0 h left of 24 h')).toBeTruthy();
  });

  it('deletes a task after confirmation (managers only)', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Update the privacy notice' }));
    const sheet = await screen.findByRole('dialog', { name: /Update the privacy notice/ });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog', { name: 'Delete AKG-001-48?' })).getByRole(
        'button',
        {
          name: 'Delete',
        },
      ),
    );

    await waitFor(() => expect(cardKeys(column('To do'))).toEqual(['AKG-001-49']));
  });
});
