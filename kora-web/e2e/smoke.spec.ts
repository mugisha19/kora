import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

test.describe('smoke', () => {
  test('root redirects to the dashboard inside the app shell', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).toHaveTitle('Dashboard · Kora');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kora home' })).toBeVisible();
  });

  test('unknown URLs show a not-found page with a way back', async ({ page }) => {
    await page.goto('/does-not-exist');

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`dashboard and settings have no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });

      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);

      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test('high-contrast preference keeps the settings page violation-free', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more' });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
