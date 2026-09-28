import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs, useEnglish } from './support';

/** Features 15–17: timesheets, approvals, capacity and planned hours, earned value. */

const MOBILE = '7c1b2c3d-0000-4000-8000-000000000001';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('timesheets', () => {
  test('a member fills the week from the keyboard and submits it', async ({ page }) => {
    await signInAs(page, 'Member');
    await useEnglish(page);
    await page.goto('/timesheets');

    const grid = page.getByRole('table', { name: 'Hours per task and day' });
    await expect(grid).toBeVisible();
    await expectNoA11yViolations(page);

    // Monday of the first task, then two cells right: Wednesday.
    await page
      .getByRole('textbox', { name: /^AKG-001-49, / })
      .first()
      .click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('7,5');
    await expect(page.getByText('All changes saved.')).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.type('20');
    await expect(
      page.getByText('A day can have at most 24 hours over all projects.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit week' })).toBeDisabled();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.getByText('All changes saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Submit week' }).click();
    const confirm = page.getByRole('dialog', { name: 'Submit this week?' });
    await expect(confirm).toContainText('21.5 h');
    await confirm.getByRole('button', { name: 'Submit week' }).click();
    await expect(
      page.getByText('This week is submitted: it can change only if a manager sends it back.'),
    ).toBeVisible();
    await expect(grid.getByRole('textbox')).toHaveCount(0);
  });

  test('the project manager approves a week and sees the sent-back one', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/time`);

    const approvals = page.getByRole('region', { name: 'Timesheets to approve' });
    await expect(approvals.getByText('Eric Nshimiyimana')).toBeVisible();
    await expectNoA11yViolations(page);

    await approvals
      .getByRole('button', { name: 'View the timesheet of Eric Nshimiyimana' })
      .click();
    const sheet = page.getByRole('dialog', { name: /Eric Nshimiyimana · week \d+/ });
    await expect(sheet.getByRole('table', { name: 'Hours per task and day' })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');

    await approvals
      .getByRole('button', { name: 'Approve the timesheet of Eric Nshimiyimana' })
      .click();
    await expect(approvals.getByText('Eric Nshimiyimana')).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Sent back' }).click();
    await expect(approvals.getByText('Odette Mukamurenzi')).toBeVisible();
  });

  test('planned hours preview utilization before they are saved', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/time`);

    // The second week Eric is on leave three days: 35 planned hours of 16 is over capacity.
    const cell = page.getByRole('textbox', { name: /^Eric Nshimiyimana, week of / }).nth(1);
    const td = cell.locator('xpath=ancestor::td');
    await expect(td).toContainText('219%');
    await cell.fill('16');
    await expect(td).toContainText('100%');
    await expect(page.getByText('Changes not saved yet (preview): 1')).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole('button', { name: 'Save planned hours' }).click();
    await expect(page.getByText('Planned hours saved.')).toBeVisible();
    await expect(page.getByText(/Changes not saved yet/)).toHaveCount(0);
  });
});

test.describe('resources', () => {
  test('the heat map shows bands in words, and a person opens with capacity and rates', async ({
    page,
  }) => {
    await signInAs(page, 'PMO');
    await useEnglish(page);
    await page.goto('/resources?weeks=8');

    const heatmap = page.getByRole('table', {
      name: 'Planned hours as a share of capacity, per person and week',
    });
    const grace = heatmap.getByRole('row').filter({ hasText: 'Grace Mukamana' });
    await expect(grace).toContainText('120%');
    await expect(grace).toContainText('Over');
    await expectNoA11yViolations(page);

    await grace.getByRole('button', { name: 'Grace Mukamana' }).click();
    const sheet = page.getByRole('dialog', { name: 'Grace Mukamana' });
    await expect(sheet.getByText('40 h a week')).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'Cost rates' })).toContainText('28,000');
    await expectNoA11yViolations(page);
  });
});

test.describe('earned value', () => {
  test('the indices, figures and S-curve data are readable without the chart', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/evm`);

    await expect(page.getByText(/progress by Physical % complete/)).toBeVisible();
    const figures = page.getByRole('region', { name: 'Figures' });
    await expect(figures).toContainText('45,600,000');
    await expect(figures).toContainText('Behind schedule by');
    await expectNoA11yViolations(page);

    await page.getByText('Show the data').click();
    const data = page.getByRole('table', { name: /S-curve/ });
    await expect(data).toBeVisible();
    expect(await data.getByRole('row').count()).toBeGreaterThan(5);
    await expectNoA11yViolations(page);
  });
});
