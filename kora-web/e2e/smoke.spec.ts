import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('home page loads with the product heading and title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Kora/);
    await expect(page.getByRole('heading', { level: 1, name: 'Kora' })).toBeVisible();
  });

  test('home page has no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
