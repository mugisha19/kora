import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../testing/mock-api';
import { openRoute } from '../../../../testing/routes';
import { provideTestUi } from '../../../../testing/test-providers';
import { Charter } from '../../../core/api/api.models';
import { PROJECT } from '../../../mocks/data-projects';
import { db } from '../../../mocks/db';
import { PROJECT_ROUTES } from '../projects.routes';
import { CharterVersionsDialog } from './charter/charter-dialogs';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];
const open = (url: string, email = 'pm@kora.demo') => openRoute(routes, url, email);

const treeItems = () =>
  within(screen.getByRole('tree'))
    .getAllByRole('treeitem')
    .map((item) => item.querySelector('[id$="-label"]')?.textContent?.replace(/\s+/g, ' ').trim());

describe('project workspace flows', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('the sponsor returns a charter with a comment the manager then sees', async () => {
    await open(`/projects/${PROJECT.warehouse}/charter`, 'pmo@kora.demo');

    await userEvent.click(await screen.findByRole('button', { name: 'Return to draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Return the charter' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Return to draft' }));
    expect(await within(dialog).findByText('This field is required.')).toBeTruthy();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Add the HR data too');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Return to draft' }));

    expect(await screen.findByText('Charter returned to draft.')).toBeTruthy();
    expect(await screen.findByText('Add the HR data too')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('opens the version history', async () => {
    await open(`/projects/${PROJECT.mobile}/charter`);

    await userEvent.click(await screen.findByRole('button', { name: 'Versions' }));
    const dialog = await screen.findByRole('dialog', { name: 'Charter versions' });
    expect(within(dialog).getByText(/There is only one version so far/)).toBeTruthy();
  });

  it('shows the difference between two versions in words', async () => {
    const base: Charter = {
      projectId: 'p',
      versionNumber: 1,
      status: 'SUPERSEDED',
      purpose: 'Bank from phones',
      objectives: [],
      inScope: ['Balances', 'Transfers'],
      outOfScope: [],
      assumptions: [],
      constraints: [],
      highLevelRisks: [],
      milestones: [],
      version: 1,
    };
    const versions = [
      { ...base, versionNumber: 2, status: 'APPROVED' as const, inScope: ['Balances', 'Loans'] },
      base,
    ];
    await render(CharterVersionsDialog, {
      providers: [...provideTestUi(), { provide: MAT_DIALOG_DATA, useValue: { versions } }],
    });

    const inScope = screen.getByRole('row', { name: /In scope/ });
    expect(within(inScope).getByText('Changed')).toBeTruthy();
    expect(within(inScope).getByText('Removed').parentElement?.textContent).toContain('Transfers');
    expect(within(inScope).getByText('Added').parentElement?.textContent).toContain('Loans');
    expect(within(screen.getByRole('row', { name: /Purpose/ })).queryByText('Changed')).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Compare' }));
    await userEvent.click(await screen.findByRole('option', { name: /Version 2/ }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('row', { name: /In scope/ })).queryByText('Changed'),
      ).toBeNull(),
    );
  });

  it('edits the project, and reports when someone else saved first', async () => {
    await open(`/projects/${PROJECT.mobile}/edit`);
    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect((screen.getByRole('textbox', { name: 'Code' }) as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText("The methodology can't change once the project is approved."),
    ).toBeTruthy();

    // Someone else saves meanwhile.
    const record = db.state.projects.find((p) => p.id === PROJECT.mobile);
    if (record) record.version += 1;

    await userEvent.clear(name);
    await userEvent.type(name, 'Mobile banking app v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'Someone else saved changes first. Reload to see them, then try again.',
      ),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    const reloaded = await screen.findByRole('textbox', { name: 'Name' });
    await userEvent.clear(reloaded);
    await userEvent.type(reloaded, 'Mobile banking app v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(TestBed.inject(Router).url).toBe(`/projects/${PROJECT.mobile}/overview`),
    );
    expect(db.state.projects.find((p) => p.id === PROJECT.mobile)?.name).toBe(
      'Mobile banking app v2',
    );
  });

  it('adds a team member as an observer', async () => {
    await open(`/projects/${PROJECT.portal}/overview`);
    const team = await screen.findByRole('region', { name: 'Team' });
    await within(team).findByText('Grace Mukamana');

    await userEvent.click(within(team).getByRole('button', { name: 'Add member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a team member' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Person' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Aline Uwase' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Project role' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Observer' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add member' }));

    const row = (await within(team).findByText('Aline Uwase')).closest('li') as HTMLElement;
    expect(within(row).getByRole('combobox').textContent).toContain('Observer');
  });

  describe('WBS', () => {
    it('indents and outdents the selected node from the toolbar', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      await userEvent.click((await screen.findAllByRole('treeitem'))[3]); // 2 Contact centre integration

      await userEvent.click(screen.getByRole('button', { name: 'Indent' }));
      await waitFor(() => expect(treeItems()).toContain('1.3 Contact centre integration'));

      await userEvent.click(screen.getByRole('button', { name: 'Outdent' }));
      await waitFor(() => expect(treeItems()).toContain('2 Contact centre integration'));
    });

    it('deletes a deliverable with its children after confirmation, and can undo it', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      (await screen.findAllByRole('treeitem'))[0].focus();

      await userEvent.keyboard('{Delete}');
      const confirm = await screen.findByRole('alertdialog', { name: 'Delete 1 Portal MVP?' });
      expect(confirm.textContent).toContain('Its 2 items underneath are deleted too.');
      await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(treeItems()).toEqual(['1 Contact centre integration']));
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
      await waitFor(() =>
        expect(treeItems()).toEqual([
          '1 Portal MVP',
          '1.1 Account requests',
          '1.2 Document upload',
          '2 Contact centre integration',
        ]),
      );
    });

    it('edits a node and turns a work package into a deliverable', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      (await screen.findAllByRole('treeitem'))[3].focus();

      await userEvent.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog', { name: 'Edit 2' });
      expect(
        (within(dialog).getByRole('textbox', { name: 'Effort' }) as HTMLInputElement).value,
      ).toBe('200');
      await userEvent.click(within(dialog).getByRole('radio', { name: 'Deliverable' }));
      expect(within(dialog).queryByRole('textbox', { name: 'Effort' })).toBeNull();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('“Contact centre integration” saved.')).toBeTruthy();
      await waitFor(() =>
        expect(within(screen.getByRole('tree')).getAllByRole('treeitem')[3].textContent).toContain(
          'Deliverable',
        ),
      );
    });

    it('collapses and expands everything', async () => {
      await open(`/projects/${PROJECT.portal}/wbs`);
      await screen.findByRole('tree');

      await userEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
      await waitFor(() => expect(treeItems()).toHaveLength(2));
      await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
      await waitFor(() => expect(treeItems()).toHaveLength(4));
    });

    it('explains an empty WBS', async () => {
      await open(`/projects/${PROJECT.warehouse}/wbs`);

      expect(await screen.findByRole('heading', { name: 'No WBS yet' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add deliverable' })).toBeTruthy();
    });
  });
});
