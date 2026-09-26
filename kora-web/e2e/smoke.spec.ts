import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs } from './support';

test.describe('smoke', () => {
  test('anonymous visitors land on sign-in', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);
    await expect(page).toHaveTitle('Sign in · Kora');
  });

  test('unknown URLs show a not-found page with a way back', async ({ page }) => {
    await signInAs(page);
    await page.goto('/does-not-exist');

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`public pages have no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });

      for (const [path, heading] of [
        ['/login', 'Sign in'],
        ['/register', 'Create your organization'],
        ['/forgot-password', 'Reset your password'],
        ['/invitations/demo-invite-new-account-0001', 'Join Akagera Digital Ltd'],
      ]) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expectNoA11yViolations(page);
      }
    });

    test(`signed-in pages have no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signInAs(page);

      for (const [path, marker] of [
        ['/dashboard', 'Dashboard'],
        ['/settings', 'Settings'],
        ['/admin/members', 'Members: 23'],
        ['/admin/invitations', 'Invitations: 3'],
        ['/admin/organization', 'Save changes'],
      ]) {
        await page.goto(path);
        // Visible matches only: on phones the closed navigation drawer also says "Dashboard".
        await expect(
          page.getByText(marker, { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible();
        await expectNoA11yViolations(page);
      }
    });
  }

  test('high-contrast preference keeps the members page violation-free', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more' });
    await signInAs(page);

    await page.goto('/admin/members');
    await expect(page.getByText('Members: 23')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
