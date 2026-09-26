import { expect, test } from '@playwright/test';
import { signInAs } from './support';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => signInAs(page));

  test('theme and language persist across reloads (feature 23)', async ({ page }) => {
    await page.goto('/settings');

    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.getByRole('radio', { name: 'Français' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
  });

  test('switching language updates text, page title and <html lang> (feature 23)', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /Change language/ }).click();
    await page.getByRole('menuitemradio', { name: 'Ikinyarwanda' }).click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'rw');
    await expect(page).toHaveTitle('Ikibaho · Kora');
    await expect(page.getByRole('heading', { level: 1, name: 'Ikibaho' })).toBeVisible();
  });

  test('the theme menu applies the choice immediately', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByRole('button', { name: /Change theme/ }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Change theme (current: Light)' })).toBeVisible();
  });

  test('keyboard: skip link reaches the page heading', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeFocused();
  });

  test('navigation moves focus to the new page heading', async ({ page, isMobile }) => {
    await page.goto('/dashboard');

    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
    }
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Settings' })
      .click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
  });

  test('no horizontal scrolling at the current viewport', async ({ page }) => {
    for (const path of ['/dashboard', '/settings']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
  });
});
