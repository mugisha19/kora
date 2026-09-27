import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { PROJECT } from '../../../../mocks/data-projects';
import { SPRINT } from '../../../../mocks/data-work';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
const open = (email = 'pm@kora.demo', projectId: string = PROJECT.mobile) =>
  openRoute(routes, `/projects/${projectId}/backlog`, email);

const backlogKeys = () =>
  within(screen.getByRole('list', { name: 'Product backlog' }))
    .getAllByText(/^AKG-001-\d+$/)
    .map((k) => k.textContent);
const sprint = (id: string) => db.state.sprints.find((s) => s.id === id);

describe('backlog', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the active sprint, the planned one and the ranked backlog', async () => {
    await open();

    const active = await screen.findByRole('region', { name: 'Sprint 5' }, { timeout: 5000 });
    expect(within(active).getByText('Security hardening for the beta')).toBeTruthy();
    const figures = within(active)
      .getAllByRole('definition')
      .map((d) => d.textContent);
    expect(figures).toEqual(['29', '8', '21']);
    await userEvent.click(await within(active).findByText('Show the data'));
    const burndown = within(active).getByRole('table', { name: 'Burndown' });
    expect(within(burndown).getAllByRole('row')).toHaveLength(15); // header + 14 days

    const planned = screen.getByRole('region', { name: 'Sprint 6' });
    expect(
      within(planned).getByText(/7 points planned · recent velocity 20.75 \(18–23\)/),
    ).toBeTruthy();
    expect(within(planned).getByRole('button', { name: 'Start sprint' })).toHaveProperty(
      'disabled',
      true,
    );

    expect(backlogKeys()).toEqual([
      'AKG-001-52',
      'AKG-001-53',
      'AKG-001-54',
      'AKG-001-55',
      'AKG-001-56',
      'AKG-001-57',
    ]);
    expect(
      screen.getByText(/Recent sprints finished 18 to 23 points, 20.75 on average/),
    ).toBeTruthy();
  });

  it('reorders the backlog with the arrows and announces the new position', async () => {
    await open();
    await screen.findByRole('list', { name: 'Product backlog' });

    await userEvent.click(screen.getByRole('button', { name: 'Move AKG-001-57 up' }));

    await waitFor(() => expect(backlogKeys().slice(-2)).toEqual(['AKG-001-57', 'AKG-001-56']));
    expect(document.activeElement?.textContent).toBe('Wrong balance after a failed transfer');
  });

  it('plans selected backlog items into a sprint and takes one back out', async () => {
    await open();
    await screen.findByRole('list', { name: 'Product backlog' });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select AKG-001-52' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select AKG-001-53' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add to sprint' }));

    const planned = screen.getByRole('region', { name: 'Sprint 6' });
    await waitFor(() => expect(within(planned).getByText(/20 points planned/)).toBeTruthy());
    expect(backlogKeys()).not.toContain('AKG-001-52');

    await userEvent.click(
      within(planned).getByRole('button', { name: 'Put AKG-001-52 back in the backlog' }),
    );
    await waitFor(() => expect(backlogKeys()[0]).toBe('AKG-001-52'));
  });

  it('closes the active sprint, carrying unfinished work to the next one', async () => {
    await open();
    const active = await screen.findByRole('region', { name: 'Sprint 5' }, { timeout: 5000 });

    await userEvent.click(within(active).getByRole('button', { name: 'Close sprint' }));
    const dialog = await screen.findByRole('dialog', { name: 'Close Sprint 5?' });
    expect(within(dialog).getByText(/7 unfinished tasks \(21 points\)/)).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Sprint 6' })).toHaveProperty('checked', true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close sprint' }));

    await waitFor(() =>
      expect(sprint(SPRINT.active)).toMatchObject({ status: 'CLOSED', completedPoints: 8 }),
    );
    const next = await screen.findByRole('region', { name: 'Sprint 6' });
    await waitFor(() =>
      expect(within(next).getByRole('button', { name: 'Start sprint' })).toHaveProperty(
        'disabled',
        false,
      ),
    );

    await userEvent.click(within(next).getByRole('button', { name: 'Start sprint' }));
    await waitFor(() =>
      expect(sprint(SPRINT.next)).toMatchObject({ status: 'ACTIVE', committedPoints: 28 }),
    );
  });

  it('plans a new sprint after the last one', async () => {
    await open();
    await screen.findByRole('region', { name: 'Sprint 5' }, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: 'Plan a sprint' }));
    const dialog = await screen.findByRole('dialog', { name: 'Plan a sprint' });
    expect((within(dialog).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe(
      'Sprint 7',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Goal' }), 'Public launch');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Plan a sprint' }));

    expect(await screen.findByRole('region', { name: 'Sprint 7' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('Public launch')).toBeTruthy();
  });

  it('adds a backlog item', async () => {
    await open('member@kora.demo');
    await screen.findByRole('list', { name: 'Product backlog' });

    expect(screen.queryByRole('button', { name: 'Plan a sprint' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'New backlog item' }));
    const sheet = await screen.findByRole('dialog', { name: 'New task' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Title' }), 'Offline mode');
    await userEvent.click(within(sheet).getByRole('button', { name: 'New task' }));

    await waitFor(() => expect(backlogKeys().at(-1)).toBe('AKG-001-58'));
  });

  it('is read-only for a viewer', async () => {
    await open('viewer@kora.demo');
    await screen.findByRole('list', { name: 'Product backlog' });

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move AKG/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close sprint' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New backlog item' })).toBeNull();
  });

  it('explains velocity before any sprint closed', async () => {
    await open('pm@kora.demo', PROJECT.portal);

    expect(await screen.findByText('Velocity appears once a sprint has been closed.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The backlog is empty' })).toBeTruthy();
  });
});
