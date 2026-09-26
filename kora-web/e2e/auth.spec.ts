import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, resetMockApi, signInAs } from './support';

/** Feature 01 acceptance criteria and the session lifecycle. */
test.describe('sign-in and sessions', () => {
  test('wrong email and wrong password produce the same message', async ({ page }) => {
    await resetMockApi(page);

    const attempt = async (email: string, password: string) => {
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      return page.getByRole('alert').textContent();
    };

    const unknownEmail = await attempt('nobody@kora.demo', DEMO_PASSWORD);
    const wrongPassword = await attempt('pm@kora.demo', 'not-the-password');
    expect(unknownEmail).toBe(wrongPassword);
    expect(unknownEmail).toContain('Email or password is incorrect.');
  });

  test('the password can be shown with a toggle button', async ({ page }) => {
    await resetMockApi(page);
    const password = page.getByLabel('Password', { exact: true });
    const toggle = page.getByRole('button', { name: 'Show password' });

    await expect(password).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('a reload keeps the user signed in (refresh cookie)', async ({ page }) => {
    await signInAs(page, 'Project manager');

    await page.goto('/settings');
    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Account menu for Grace Mukamana' }),
    ).toBeVisible();
  });

  test('returns to the requested page after signing in', async ({ page }) => {
    await resetMockApi(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fsettings$/);

    await page.getByRole('button', { name: /^Member / }).click();

    await expect(page).toHaveURL(/\/settings$/);
  });

  test('returnUrl=https://evil.example lands on /dashboard', async ({ page }) => {
    await resetMockApi(page);
    await page.goto('/login?returnUrl=https%3A%2F%2Fevil.example');

    await page.getByRole('button', { name: /^Viewer / }).click();

    await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
  });

  test('signing out ends the session', async ({ page }) => {
    await signInAs(page);

    await page.getByRole('button', { name: /Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);
  });

  test('forgot password gives the same neutral answer for any email', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.getByLabel('Email').fill('someone@nowhere.example');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('status')).toContainText(
      'If an account exists for someone@nowhere.example',
    );
  });

  test('register an organization, then land in it as administrator', async ({ page }) => {
    await resetMockApi(page);
    await page.getByRole('link', { name: 'Create an organization' }).click();

    await page.getByLabel('Organization name').fill('Nyungwe Consulting');
    await page.getByLabel('Full name').fill('Test Person');
    await page.getByLabel('Email').fill('owner@nyungwe.example');
    await page.getByLabel('Password', { exact: true }).fill('a long enough passphrase');
    await page.getByRole('button', { name: 'Create organization' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Organization:\s*Nyungwe Consulting/ }),
    ).toBeVisible();
  });
});
