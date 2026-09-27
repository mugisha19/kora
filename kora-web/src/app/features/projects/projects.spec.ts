import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { firstValueFrom } from 'rxjs';
import { resetMockApi } from '../../../testing/mock-api';
import { openRoute } from '../../../testing/routes';
import { ProjectsApi } from '../../core/api/projects.api';
import { PORTFOLIO, PROJECT } from '../../mocks/data-projects';
import { PROJECT_ROUTES } from './projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
const open = (url: string, email = 'pm@kora.demo') => openRoute(routes, url, email);

const rows = () => screen.getAllByRole('row').slice(1);
const tabNames = () =>
  within(screen.getByRole('tablist', { name: 'Project sections' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent?.trim());

describe('projects', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  describe('list', () => {
    it("shows a viewer only the projects they're on, without a create action", async () => {
      await open('/projects', 'viewer@kora.demo');

      expect(await screen.findByText('1 projects')).toBeTruthy();
      expect(rows().map((row) => row.textContent)).toEqual([
        expect.stringContaining('Mobile banking app'),
      ]);
      expect(screen.queryByRole('link', { name: 'New project' })).toBeNull();
    });

    it('reads filters from the URL and writes new ones back', async () => {
      await open('/projects?status=IN_PROGRESS');

      expect(await screen.findByText('3 projects')).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('In progress');

      await userEvent.click(screen.getByRole('combobox', { name: 'Health' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Off track' }));

      await waitFor(() =>
        expect(TestBed.inject(Router).url).toBe('/projects?status=IN_PROGRESS&health=RED'),
      );
      expect(await screen.findByText('1 projects')).toBeTruthy();
      expect(rows()[0].textContent).toContain('ERP rollout');
      expect(rows()[0].textContent).toContain('Off track (overridden)');
    });

    it('says when nothing matches and clears the filters', async () => {
      await open('/projects?q=nothing-like-this');

      expect(await screen.findByRole('heading', { name: 'No matching projects' })).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      await waitFor(() => expect(TestBed.inject(Router).url).toBe('/projects'));
    });
  });

  describe('create', () => {
    it('validates dates and methodology, then creates the project and opens it', async () => {
      await open(`/projects/new?portfolioId=${PORTFOLIO.digital}`);
      await screen.findByRole('heading', { level: 1, name: 'New project' });

      await userEvent.type(screen.getByRole('textbox', { name: 'Code' }), 'akg-020');
      await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Agent banking pilot');
      await userEvent.type(screen.getByLabelText('Start date'), '2026-11-02');
      await userEvent.type(screen.getByLabelText('Target end date'), '2026-10-01');
      await userEvent.type(screen.getByRole('textbox', { name: 'Budget' }), '12 500 000');
      await userEvent.click(screen.getByRole('button', { name: 'New project' }));

      expect(
        await screen.findByText('The target end date must be after the start date.'),
      ).toBeTruthy();
      expect(screen.getAllByText('This field is required.')).toHaveLength(1); // methodology

      await userEvent.click(screen.getByRole('radio', { name: /Agile/ }));
      await userEvent.clear(screen.getByLabelText('Target end date'));
      await userEvent.type(screen.getByLabelText('Target end date'), '2027-06-30');
      await userEvent.click(screen.getByRole('button', { name: 'New project' }));

      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: 'Agent banking pilot' },
          { timeout: 5000 },
        ),
      ).toBeTruthy();
      const project = (await firstValueFrom(TestBed.inject(ProjectsApi).list({ q: 'AKG-020' })))
        .content[0];
      expect(project).toMatchObject({
        code: 'AKG-020',
        status: 'PROPOSED',
        methodology: 'AGILE',
        budget: { amount: '12500000', currency: 'RWF' },
      });
      expect(TestBed.inject(Router).url).toBe(`/projects/${project.id}/overview`);
    });

    it('shows a taken code on the code field', async () => {
      await open(`/projects/new?portfolioId=${PORTFOLIO.digital}`);
      await screen.findByRole('heading', { level: 1, name: 'New project' });

      await userEvent.type(screen.getByRole('textbox', { name: 'Code' }), 'AKG-001');
      await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Duplicate');
      await userEvent.click(screen.getByRole('radio', { name: /Predictive/ }));
      await userEvent.type(screen.getByLabelText('Start date'), '2026-11-02');
      await userEvent.type(screen.getByLabelText('Target end date'), '2027-01-01');
      await userEvent.click(screen.getByRole('button', { name: 'New project' }));

      expect(await screen.findByText('Another project already uses this code.')).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Code' }));
    });
  });

  describe('workspace', () => {
    it('offers the tabs of the methodology', async () => {
      await open(`/projects/${PROJECT.mobile}`);
      await screen.findByRole('heading', { level: 1, name: 'Mobile banking app' });
      const governance = ['Risks', 'Issues', 'Stakeholders', 'Changes'];
      expect(tabNames()).toEqual(['Overview', 'Charter', 'WBS', 'Board', 'Backlog', ...governance]);

      await TestBed.inject(Router).navigateByUrl(`/projects/${PROJECT.warehouse}`);
      await screen.findByRole('heading', { level: 1, name: 'Data warehouse' });
      expect(tabNames()).toEqual(['Overview', 'Charter', 'WBS', 'Schedule', ...governance]);
    });

    it('shows a viewer the project without any way to change it', async () => {
      await open(`/projects/${PROJECT.mobile}/overview`, 'viewer@kora.demo');
      await screen.findByRole('heading', { name: 'Team' });

      expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Move to/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Override health' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add member' })).toBeNull();
    });

    it('moves the project on hold only with a reason', async () => {
      await open(`/projects/${PROJECT.mobile}/overview`);
      const lifecycle = await screen.findByRole('region', { name: 'Lifecycle' });
      expect(
        within(lifecycle)
          .getAllByRole('button')
          .map((b) => b.textContent?.trim()),
      ).toEqual(['Move to On hold', 'Move to Closing', 'Move to Cancelled']);

      await userEvent.click(within(lifecycle).getByRole('button', { name: 'Move to On hold' }));
      const dialog = await screen.findByRole('dialog', { name: 'Move to On hold?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Move to On hold' }));
      expect(await within(dialog).findByText('This field is required.')).toBeTruthy();

      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Vendor audit');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Move to On hold' }));

      expect(await screen.findByText('The project is now On hold.')).toBeTruthy();
      expect(await within(lifecycle).findByText('On hold')).toBeTruthy();
      expect(
        within(lifecycle)
          .getAllByRole('button')
          .map((b) => b.textContent?.trim()),
      ).toEqual(['Move to In progress', 'Move to Cancelled']);
    });

    it('overrides health with a reason everyone sees', async () => {
      await open(`/projects/${PROJECT.mobile}/overview`);
      const health = await screen.findByRole('region', { name: 'Health' });

      await userEvent.click(within(health).getByRole('button', { name: 'Override health' }));
      const dialog = await screen.findByRole('dialog', { name: 'Override health' });
      await userEvent.click(within(dialog).getByRole('radio', { name: /Off track/ }));
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: 'Reason' }),
        'Key developer left',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Override' }));

      expect(await within(health).findByText('Off track (overridden)')).toBeTruthy();
      expect(within(health).getByText('Key developer left')).toBeTruthy();
      await userEvent.click(within(health).getByRole('button', { name: 'Use computed health' }));
      // The computed health and its reason ("On track") are back.
      await waitFor(() => expect(within(health).queryByText('Off track (overridden)')).toBeNull());
      expect(within(health).getAllByText('On track')).toHaveLength(2);
    });

    it('keeps the manager on the team and removes others after confirmation', async () => {
      await open(`/projects/${PROJECT.mobile}/overview`);
      const team = await screen.findByRole('region', { name: 'Team' });
      await within(team).findByText('Diane Ingabire');

      expect(within(team).queryByRole('button', { name: /Remove Grace/ })).toBeNull();
      await userEvent.click(
        within(team).getByRole('button', { name: 'Remove Diane Ingabire from the team' }),
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(within(team).queryByText('Diane Ingabire')).toBeNull());
    });
  });
});
