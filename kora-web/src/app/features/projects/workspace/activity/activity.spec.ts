import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { call, signIn } from '../../../../../testing/mock-requests';
import { openRoute } from '../../../../../testing/routes';
import { USER } from '../../../../mocks/data';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
const mobileTask = (n: number) =>
  db.state.tasks.find((t) => t.projectId === PROJECT.mobile && t.number === n)!;

/** Another person changes a task, through the mock API (and its outbox). */
async function assignAs(email: string, n: number, assigneeId: string) {
  const { headers } = await signIn(email);
  const task = mobileTask(n);
  return call('PATCH', `/tasks/${task.id}`, {
    headers: { ...headers(), 'If-Match': `"${task.version}"` },
    body: { assigneeId },
  });
}

describe('activity and history', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows what happened by day, with links to the items', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/activity`, 'member@kora.demo');

    const today = await screen.findByRole('region', { name: 'Today' }, { timeout: 5000 });
    const first = within(today).getAllByRole('listitem')[0];
    expect(first.textContent).toMatch(/Grace Mukamana\s+updated\s+task\s+AKG-001-49: assignee/);
    expect(within(first).getByRole('link', { name: 'AKG-001-49' }).getAttribute('href')).toBe(
      `/projects/${PROJECT.mobile}/tasks/${mobileTask(49).id}`,
    );
    // A system change, and a change without a page of its own (no link).
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items.some((text) => /Kora\s+updated\s+issue/.test(text))).toBe(true);
    expect(screen.getByText('Sprint 5').tagName).toBe('SPAN');
  });

  it('adds what others do as it happens', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/activity`, 'member@kora.demo');
    await screen.findByRole('region', { name: 'Today' }, { timeout: 5000 });

    expect((await assignAs('pm@kora.demo', 45, USER.member)).status).toBe(200);

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Today' })).getAllByRole('listitem')[0]
          .textContent,
      ).toContain('AKG-001-45'),
    );
  });

  it('opens a task from its link over the board, with its change history', async () => {
    const task = mobileTask(49);
    await openRoute(routes, `/projects/${PROJECT.mobile}/tasks/${task.id}`, 'member@kora.demo');

    const dialog = await screen.findByRole('dialog', { name: /AKG-001-49/ }, { timeout: 5000 });
    expect(TestBed.inject(Router).url).toBe(`/projects/${PROJECT.mobile}/board/${task.id}`);

    const toggle = within(dialog).getByRole('button', { name: 'Change history' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    const entry = await within(dialog).findByText(/Grace Mukamana/, { selector: 'strong' });
    const item = entry.closest('li') as HTMLElement;
    expect(item.textContent).toContain('changed it');
    expect(within(item).getByText('Assignee')).toBeTruthy();
    expect(item.textContent).toContain('Eric Nshimiyimana');

    // Closing the sheet goes back to the board.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(TestBed.inject(Router).url).toBe(`/projects/${PROJECT.mobile}/board`),
    );
  });

  it('says so when an item has no recorded changes yet', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/overview`, 'pm@kora.demo');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change history' }, { timeout: 5000 }),
    );

    expect(await screen.findByText('No changes recorded yet.')).toBeTruthy();
  });
});
