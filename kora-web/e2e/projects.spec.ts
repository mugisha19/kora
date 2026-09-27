import { Page, expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { DemoRole, signInAs as signIn, useEnglish } from './support';

/** Features 04–07: portfolios, projects and their lifecycle, dashboard, charter, WBS. */

// Dialogs and toasts animate in; axe must not measure contrast halfway through a fade.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// Demo ids (src/app/mocks/data-projects.ts).
const PORTFOLIO_DIGITAL = '7a1b2c3d-0000-4000-8000-000000000001';
const PROJECT = {
  mobile: '7c1b2c3d-0000-4000-8000-000000000001',
  portal: '7c1b2c3d-0000-4000-8000-000000000002',
  warehouse: '7c1b2c3d-0000-4000-8000-000000000005',
  crm: '7c1b2c3d-0000-4000-8000-000000000007',
};

/** Signs in and makes sure the UI is in English (the PMO's profile is French). */
async function signInAs(page: Page, role: DemoRole): Promise<void> {
  await signIn(page, role);
  await useEnglish(page);
}

const tabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Project sections' }).getByRole('tab');

test.describe('portfolios and projects', () => {
  test('a project manager creates an Agile project in a portfolio and finds it in the list', async ({
    page,
  }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/portfolios/${PORTFOLIO_DIGITAL}`);
    await page.getByRole('link', { name: 'New project' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'New project' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Code' }).fill('akg-020');
    await page.getByRole('textbox', { name: 'Name' }).fill('Agent banking pilot');
    await page.getByRole('radio', { name: /Agile/ }).check();
    await page.getByLabel('Start date').fill('2026-11-02');
    await page.getByLabel('Target end date').fill('2027-06-30');
    await page.getByRole('textbox', { name: 'Budget' }).fill('12 500 000');
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'New project' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Agent banking pilot' }),
    ).toBeVisible();
    await expect(tabs(page)).toHaveText([
      'Overview',
      'Charter',
      'WBS',
      'Board',
      'Backlog',
      'Risks',
      'Issues',
      'Stakeholders',
      'Changes',
    ]);

    await page.goto('/projects?q=AKG-020');
    await expect(page.getByRole('row', { name: /AKG-020 Agent banking pilot/ })).toBeVisible();
  });

  test('a viewer sees projects but no way to create or change them', async ({ page }) => {
    await signInAs(page, 'Viewer');
    await page.goto('/projects');

    await expect(page.getByText('1 projects')).toBeVisible();
    await expect(page.getByRole('link', { name: 'New project' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Mobile banking app' }).click();
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Move to/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

    await page.goto('/projects/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });

  test('the workspace tabs follow the methodology, and a closed project is final', async ({
    page,
  }) => {
    await signInAs(page, 'PMO');

    await page.goto(`/projects/${PROJECT.warehouse}`);
    await expect(tabs(page)).toHaveText([
      'Overview',
      'Charter',
      'WBS',
      'Schedule',
      'Risks',
      'Issues',
      'Stakeholders',
      'Changes',
    ]);

    await page.goto(`/projects/${PROJECT.crm}/overview`);
    const lifecycle = page.getByRole('region', { name: 'Lifecycle' });
    await expect(lifecycle).toContainText("This project is finished; its status can't change.");
    await expect(lifecycle.getByRole('button')).toHaveCount(0);
  });

  test('a project goes on hold only with a reason', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${PROJECT.mobile}/overview`);

    await page.getByRole('button', { name: 'Move to On hold' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move to On hold?' });
    await dialog.getByRole('button', { name: 'Move to On hold' }).click();
    await expect(dialog.getByText('This field is required.')).toBeVisible();
    await expectNoA11yViolations(page);

    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Vendor audit');
    await dialog.getByRole('button', { name: 'Move to On hold' }).click();

    await expect(page.getByText('The project is now On hold.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move to In progress' })).toBeVisible();
  });
});

test.describe('charter', () => {
  test('the sponsor approves the charter, which approves the project', async ({ page }) => {
    await signInAs(page, 'PMO');
    await page.goto(`/projects/${PROJECT.warehouse}/charter`);

    await expect(page.getByText('Awaiting approval')).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByText(/Approved by Jean-Paul Habimana on/)).toBeVisible();
    await expect(page.locator('header').getByText('Approved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('a returned draft is edited with keyboard-operable lists', async ({ page }) => {
    // A submitted charter can't be edited: the PMO returns it first, then (as a governor) edits it.
    await signInAs(page, 'PMO');
    await page.goto(`/projects/${PROJECT.warehouse}/charter`);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Return to draft' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill('Add the HR data too');
    await page.getByRole('dialog').getByRole('button', { name: 'Return to draft' }).click();
    await expect(page.getByText('Returned with a comment:')).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Add to In scope' }).click();
    await page.keyboard.type('HR data');
    await page.getByRole('button', { name: 'Move item 2 up' }).click();
    await expect(page.getByRole('textbox', { name: 'In scope, item 1' })).toHaveValue('HR data');
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page.getByText('Charter saved.')).toBeVisible();
    const inScope = page.getByRole('heading', { name: 'In scope' }).locator('..');
    await expect(inScope.getByRole('listitem')).toHaveText([
      'HR data',
      'Finance and customer data',
    ]);
  });
});

test.describe('work breakdown structure', () => {
  test('the tree works with the keyboard and renumbers after a move', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${PROJECT.portal}/wbs`);

    const tree = page.getByRole('tree', { name: 'Work breakdown structure' });
    await expect(tree.getByRole('treeitem')).toHaveCount(4);
    await expectNoA11yViolations(page);

    await tree.getByRole('treeitem', { name: '1.1 Account requests' }).click();
    await page.keyboard.press('Alt+ArrowDown');

    await expect(tree.getByRole('treeitem', { name: '1.2 Account requests' })).toBeFocused();
    await expect(tree.getByRole('treeitem', { name: '1.1 Document upload' })).toBeVisible();

    await page.keyboard.press('ArrowLeft'); // to "1 Portal MVP"
    await page.keyboard.press('ArrowLeft'); // collapse it
    await expect(tree.getByRole('treeitem')).toHaveCount(2);
  });
});

test.describe('dashboard', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`shows health with text and passes axe (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signInAs(page, 'PMO');

      await expect(page.getByText('Active projects')).toBeVisible();
      const attention = page.getByRole('table', { name: 'Needs attention' });
      await expect(attention.getByRole('row').nth(1)).toContainText('Off track (overridden)');
      await expect(page.getByRole('table', { name: 'Projects by health' })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test('portfolios, project list and workspace pass axe', async ({ page }) => {
    await signInAs(page, 'PMO');

    for (const url of [
      '/portfolios',
      `/portfolios/${PORTFOLIO_DIGITAL}`,
      '/projects',
      `/projects/${PROJECT.mobile}/overview`,
      `/projects/${PROJECT.mobile}/board`,
    ]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Loading…')).toHaveCount(0);
      await expectNoA11yViolations(page);
    }
  });
});
