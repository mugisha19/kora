import { Locator, Page, expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs, useEnglish } from './support';

/** Features 08–09: tasks, the Kanban board, backlog and sprints. */

const MOBILE = '7c1b2c3d-0000-4000-8000-000000000001';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const card = (area: Page | Locator, key: string) => area.locator('li', { hasText: key });

/** Drags with real pointer moves (the CDK needs several to start a drag). */
async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (!source || !target) throw new Error('Nothing to drag');
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  const x = target.x + target.width / 2;
  // Just inside the top of the list (a tall list can end below the viewport).
  const y = target.y + 12;
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(
      source.x + 20 + ((x - source.x - 20) * step) / 10,
      source.y + 20 + ((y - source.y - 20) * step) / 10,
    );
  }
  await page.mouse.up();
}

test.describe('board', () => {
  test('dragging a card persists its new column', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones use the Move menu (next test)');
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/board`);
    await expect(card(column(page, 'To do'), 'AKG-001-49')).toBeVisible();

    await drag(
      page,
      card(column(page, 'To do'), 'AKG-001-49'),
      column(page, 'Blocked').locator('ul.cards'),
    );
    const dialog = page.getByRole('dialog', { name: 'Why is AKG-001-49 blocked?' });
    await dialog.getByRole('textbox').fill('Waiting for the new SDK');
    await dialog.getByRole('button', { name: 'Block' }).click();

    // The reason comes back from the API: the move is saved, not just shown.
    await expect(card(column(page, 'Blocked'), 'AKG-001-49')).toContainText(
      'Waiting for the new SDK',
    );
    await page.reload();
    await expect(card(column(page, 'Blocked'), 'AKG-001-49')).toContainText(
      'Waiting for the new SDK',
    );
  });

  test('every move has a keyboard equivalent, announced', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/board`);

    await page.getByRole('button', { name: 'Move AKG-001-49' }).click();
    await page.getByRole('menuitem', { name: 'Move to Blocked' }).click();
    const dialog = page.getByRole('dialog', { name: 'Why is AKG-001-49 blocked?' });
    await dialog.getByRole('textbox').fill('Waiting for the new SDK');
    await dialog.getByRole('button', { name: 'Block' }).click();

    await expect(card(column(page, 'Blocked'), 'AKG-001-49')).toContainText(
      'Waiting for the new SDK',
    );
    await expect(page.locator('.cdk-live-announcer-element')).toContainText(
      'Moved AKG-001-49 to Blocked, position',
    );
    await expect(page.getByRole('button', { name: 'Move AKG-001-49' })).toBeFocused();
  });

  test('a full column asks before a move, and the board passes axe', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/board`);
    await expect(column(page, 'In progress')).toContainText('At limit');
    await expectNoA11yViolations(page);

    await page.getByRole('button', { name: 'Move AKG-001-48' }).click();
    await page.getByRole('menuitem', { name: 'Move to In progress' }).click();
    await page
      .getByRole('dialog', { name: 'Column at its limit' })
      .getByRole('button', { name: 'Cancel' })
      .click();

    await expect(card(column(page, 'To do'), 'AKG-001-48')).toBeVisible();
  });

  test('a task opens in a side sheet with its Markdown and comments', async ({ page }) => {
    await signInAs(page, 'Member');
    await useEnglish(page);
    await page.goto(`/projects/${MOBILE}/board`);

    await page.getByRole('button', { name: 'Two-step sign-in with SMS codes' }).click();
    const sheet = page.getByRole('dialog', { name: /Two-step sign-in with SMS codes/ });
    await expect(sheet.locator('strong', { hasText: '5 minutes' })).toBeVisible();
    await expect(sheet.getByText(/Ready for review/)).toBeVisible();
    await expectNoA11yViolations(page);

    await sheet.getByRole('textbox', { name: 'Add a comment' }).fill('Tested on Android 15 too');
    await sheet.getByRole('button', { name: 'Comment' }).click();
    await expect(sheet.getByText('Tested on Android 15 too')).toBeVisible();
  });
});

test.describe('backlog and sprints', () => {
  test('plan backlog items into the next sprint, close the active one, start the next', async ({
    page,
  }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/backlog`);

    const next = page.getByRole('region', { name: 'Sprint 6' });
    await expect(next).toContainText('7 points planned');
    await expectNoA11yViolations(page);

    await page.getByRole('checkbox', { name: 'Select AKG-001-52' }).check();
    await page.getByRole('button', { name: 'Add to sprint' }).click();
    await expect(next).toContainText('15 points planned');

    const active = page.getByRole('region', { name: 'Sprint 5' });
    await active.getByRole('button', { name: 'Close sprint' }).click();
    const dialog = page.getByRole('dialog', { name: 'Close Sprint 5?' });
    await expect(dialog.getByRole('radio', { name: 'Sprint 6' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Close sprint' }).click();
    await expect(page.getByText('Sprint 5 closed with 8 points done.')).toBeVisible();

    await next.getByRole('button', { name: 'Start sprint' }).click();
    await expect(page.getByRole('region', { name: 'Sprint 6' })).toContainText('Active');
    await expect(page.getByRole('region', { name: 'Sprint 6' })).toContainText('36');
  });

  test('the backlog reorders with the keyboard', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/backlog`);

    await page.getByRole('button', { name: 'Move AKG-001-57 up' }).click();
    const list = page.getByRole('list', { name: 'Product backlog' });
    await expect(list.getByRole('listitem').nth(4)).toContainText('AKG-001-57');
    await expect(page.locator('.cdk-live-announcer-element')).toContainText(
      'AKG-001-57 is now at position 5 of 6.',
    );
  });
});
