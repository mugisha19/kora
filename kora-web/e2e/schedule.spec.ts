import { Locator, Page, expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs } from './support';

/** Feature 10: dependencies, the critical-path schedule, baselines and the working calendar. */

const WAREHOUSE = '7c1b2c3d-0000-4000-8000-000000000005';
const task = (n: number) => `7f3b2c3d-0000-4000-8000-${String(n).padStart(12, '0')}`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const bar = (page: Page, n: number) => page.locator(`[data-task="${task(n)}"] .shape`);
const summary = (page: Page, term: string) =>
  page.locator('.summary div', { hasText: term }).locator('dd');

/** The schedule's finish date as shown once it has loaded. */
async function finishDate(page: Page): Promise<string> {
  const finish = summary(page, 'Finishes');
  await expect(finish).toHaveText(/\d{4}/);
  return (await finish.textContent())?.trim() ?? '';
}

/** Presses on `from` and releases at `to`, in small steps like a hand would. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  const box = await from.boundingBox();
  if (!box) throw new Error('Nothing to drag');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      start.x + ((to.x - start.x) * step) / 8,
      start.y + ((to.y - start.y) * step) / 8,
    );
  }
  await page.mouse.up();
}

/** Opens a select with the keyboard and picks an option. */
async function choose(page: Page, select: Locator, option: RegExp): Promise<void> {
  await select.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: option }).click();
}

test.describe('schedule', () => {
  test('the Gantt and the table show the critical path, accessibly', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${WAREHOUSE}/schedule`);

    await expect(page.getByRole('img', { name: /Gantt chart of 8 tasks/ })).toBeVisible();
    // Demo dates are relative to today: check the shape, not the day.
    await expect(summary(page, 'Finishes')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    await expect(page.locator('.names').getByText('Critical', { exact: true })).toHaveCount(7);
    await expectNoA11yViolations(page);

    await page.getByRole('radio', { name: 'Table' }).click();
    await expect(page).toHaveURL(/view=table/);
    const legal = page.getByRole('row', { name: /^AKG-005-3 Approve/ });
    await expect(legal).toContainText('4 d late');
    await expectNoA11yViolations(page);
  });

  test('dragging a bar past its float moves the finish', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones edit in the table view');
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${WAREHOUSE}/schedule?zoom=day`);
    const finance = bar(page, 4);
    const before = await finishDate(page);
    await finance.scrollIntoViewIfNeeded();
    const box = await finance.boundingBox();
    if (!box) throw new Error('No bar');

    // Ten days at 28 px a day: past its four days of float.
    await drag(page, finance, { x: box.x + box.width / 2 + 280, y: box.y + box.height / 2 });

    await expect(summary(page, 'Finishes')).not.toHaveText(before);
    await expect(page.locator(`[data-task="${task(4)}"]`)).toHaveClass(/critical/);
  });

  test('linking bars into a loop names the chain', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones link tasks in the table view');
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${WAREHOUSE}/schedule`);
    const connector = page.locator(`[data-task="${task(3)}"] .connector`);
    await connector.scrollIntoViewIfNeeded();
    const target = await bar(page, 2).boundingBox();
    if (!target) throw new Error('No bar');

    await drag(page, connector, {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    });

    await expect(page.getByRole('alert')).toContainText('AKG-005-3 → AKG-005-2 → AKG-005-3');
  });

  test('the table offers every edit with the keyboard', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${WAREHOUSE}/schedule?view=table`);

    const before = await finishDate(page);
    await page.getByRole('button', { name: 'Add a predecessor to AKG-005-7' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a dependency' });
    await choose(
      page,
      dialog.getByRole('combobox', { name: 'Predecessor (comes first)' }),
      /AKG-005-4/,
    );
    await choose(page, dialog.getByRole('combobox', { name: 'Link type' }), /Start to start/);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Add dependency' }).click();
    await expect(page.getByRole('row', { name: /^AKG-005-7 / })).toContainText('AKG-005-4 SS');

    await page.getByRole('button', { name: 'Edit the schedule of AKG-005-1' }).click();
    const edit = page.getByRole('dialog', { name: 'Schedule of AKG-005-1' });
    await edit.getByRole('textbox', { name: 'Duration (working days)' }).fill('7');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /^AKG-005-1 / })).toContainText('7 d');
    await expect(summary(page, 'Finishes')).not.toHaveText(before);
  });
});

test.describe('working calendar', () => {
  test('an admin adds a holiday and saves the calendar', async ({ page }) => {
    await signInAs(page, 'Administrator');
    await page.goto('/admin/calendar');

    await expect(page.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    await expect(page.getByText('Christmas Day')).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByLabel('Date').fill('2026-10-05');
    await page.getByRole('textbox', { name: 'Name' }).fill('Company day');
    await page.getByRole('button', { name: 'Add holiday' }).click();
    await page.getByRole('button', { name: 'Save calendar' }).click();

    await expect(page.getByText('Working calendar saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Company day')).toBeVisible();
  });
});
