import { TestBed } from '@angular/core/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { firstValueFrom } from 'rxjs';
import { resetMockApi } from '../../../../testing/mock-api';
import { openRoute } from '../../../../testing/routes';
import { ProjectsApi } from '../../../core/api/projects.api';
import { PORTFOLIO, PROJECT } from '../../../mocks/data-projects';
import { PROJECT_ROUTES } from '../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
const open = (url: string, email = 'pm@kora.demo') => openRoute(routes, url, email);

/** Visible tree items, as "code name". */
const treeItems = () =>
  within(screen.getByRole('tree'))
    .getAllByRole('treeitem')
    .map((item) => item.querySelector('[id$="-label"]')?.textContent?.replace(/\s+/g, ' ').trim());

describe('project workspace tabs', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  describe('charter', () => {
    it('lets the sponsor approve the submitted charter, which approves the project', async () => {
      await open(`/projects/${PROJECT.warehouse}/charter`, 'pmo@kora.demo');

      expect(await screen.findByText('Awaiting approval')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      expect(await screen.findByText('Charter approved: the project is authorized.')).toBeTruthy();
      expect(await screen.findByText(/Approved by Jean-Paul Habimana/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      // The workspace header follows: the project is now approved.
      const header = screen
        .getByRole('heading', { level: 1, name: 'Data warehouse' })
        .closest('header');
      expect(await within(header as HTMLElement).findByText('Approved')).toBeTruthy();
    });

    it("doesn't let the manager approve their own charter", async () => {
      await open(`/projects/${PROJECT.warehouse}/charter`);

      await screen.findByText('Awaiting approval');
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    });

    it('edits the draft with keyboard-operable lists and names what is missing on submit', async () => {
      const harness = await open('/projects');
      const created = await firstValueFrom(
        TestBed.inject(ProjectsApi).create({
          code: 'AKG-030',
          name: 'Branch refresh',
          portfolioId: PORTFOLIO.digital,
          methodology: 'PREDICTIVE',
          startDate: '2026-11-01',
          targetEndDate: '2027-03-31',
        }),
      );
      await harness.navigateByUrl(`/projects/${created.id}/charter`);
      await screen.findByText('Draft');

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Add to In scope' }));
      await userEvent.keyboard('Kigali branches');
      await userEvent.click(screen.getByRole('button', { name: 'Add to In scope' }));
      await userEvent.keyboard('Huye branch');
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'In scope, item 2' }),
      );

      await userEvent.click(screen.getByRole('button', { name: 'Move item 2 up' }));
      expect(
        (screen.getByRole('textbox', { name: 'In scope, item 1' }) as HTMLInputElement).value,
      ).toBe('Huye branch');
      expect(await screen.findByText('Moved to position 1 of 2.')).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      expect(await screen.findByText('Charter saved.')).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull());
      const inScope = screen.getByRole('heading', { name: 'In scope' })
        .parentElement as HTMLElement;
      expect(
        within(inScope)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['Huye branch', 'Kigali branches']);

      await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Before it can be submitted, the charter needs:');
      expect(
        within(alert)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['Purpose', 'Objectives', 'Sponsor']);
    });
  });

  describe('WBS', () => {
    it('renders an accessible tree with rolled-up values', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);

      const tree = await screen.findByRole('tree', { name: 'Work breakdown structure' });
      expect(treeItems()).toEqual([
        '1 Portal MVP',
        '1.1 Account requests',
        '1.2 Document upload',
        '2 Contact centre integration',
      ]);
      const mvp = within(tree).getAllByRole('treeitem')[0];
      expect(mvp.getAttribute('aria-level')).toBe('1');
      expect(mvp.getAttribute('aria-expanded')).toBe('true');
      expect(mvp.getAttribute('aria-posinset')).toBe('1');
      expect(mvp.getAttribute('aria-setsize')).toBe('2');
      expect(mvp.getAttribute('tabindex')).toBe('0');
      // Figures are read as the description, not as part of the name.
      expect(
        screen.getByText(/Effort 550 h, cost RWF\s16,500,000, 97.7% complete \(rolled up\)/),
      ).toBeTruthy();
    });

    it('moves, opens and closes with the arrow keys', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      const items = await screen.findAllByRole('treeitem');
      items[0].focus();

      await userEvent.keyboard('{ArrowDown}');
      expect(document.activeElement?.textContent).toContain('Account requests');
      await userEvent.keyboard('{ArrowLeft}'); // to the parent
      expect(document.activeElement?.getAttribute('aria-level')).toBe('1');
      await userEvent.keyboard('{ArrowLeft}'); // collapse
      await waitFor(() =>
        expect(treeItems()).toEqual(['1 Portal MVP', '2 Contact centre integration']),
      );
      await userEvent.keyboard('{End}');
      expect(document.activeElement?.textContent).toContain('Contact centre integration');
      await userEvent.keyboard('{Home}{ArrowRight}'); // expand again
      await waitFor(() => expect(treeItems()).toHaveLength(4));
    });

    it('reorders with Alt+arrows, renumbering the codes, and can undo', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      const items = await screen.findAllByRole('treeitem');
      items[1].focus(); // 1.1 Account requests

      await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');

      await waitFor(() =>
        expect(treeItems()).toEqual([
          '1 Portal MVP',
          '1.1 Document upload',
          '1.2 Account requests',
          '2 Contact centre integration',
        ]),
      );
      expect(document.activeElement?.textContent).toContain('Account requests');
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(treeItems()[1]).toBe('1.1 Account requests'));
    });

    it('adds a work package under the selected deliverable', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      await screen.findByRole('tree');

      await userEvent.click(screen.getByRole('button', { name: 'Add item under it' }));
      const dialog = await screen.findByRole('dialog', { name: 'Add under 1 Portal MVP' });
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Notifications');
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Effort' }), '50');
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Cost' }), '1 500 000');
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Complete' }), '120');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      expect(await within(dialog).findByText('Enter a percentage from 0 to 100.')).toBeTruthy();

      await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Complete' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

      await waitFor(() => expect(treeItems()).toContain('1.3 Notifications'));
    });

    it('is read-only for someone who is not the manager', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`, 'member@kora.demo');
      await screen.findByRole('tree');

      expect(screen.queryByRole('toolbar')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add deliverable' })).toBeNull();
    });
  });
});
