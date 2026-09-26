import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, ORG_AKAGERA, openNavigation, resetMockApi, signInAs } from './support';

/** Features 02 and 03: organizations, members, roles and invitations. */
test.describe('organizations and administration', () => {
  test('a viewer opening /admin/members is sent back with a message', async ({ page }) => {
    await signInAs(page, 'Viewer');

    await page.goto('/admin/members');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("You don't have permission to open that page.")).toBeVisible();
  });

  test('only administrators see Administration in the navigation', async ({ page, isMobile }) => {
    await signInAs(page, 'Project manager');
    await openNavigation(page, isMobile);

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  });

  test('switching organization changes the tenant header and the visible role', async ({
    page,
  }) => {
    await signInAs(page, 'Administrator');
    const switcher = page.getByRole('button', { name: /Organization:/ });
    await expect(switcher).toContainText('Akagera Digital Ltd');

    await switcher.click();
    await page.getByRole('menuitemradio', { name: /Virunga Build Partners/ }).click();

    await expect(page.getByRole('button', { name: /Organization:/ })).toContainText('Virunga');
    // PMO in Virunga: the admin area is no longer offered.
    await page.goto('/admin/members');
    await expect(page).toHaveURL(/\/dashboard$/);

    // Back in Akagera, admin calls carry Akagera's id.
    await page.getByRole('button', { name: /Organization:/ }).click();
    await page.getByRole('menuitemradio', { name: /Akagera Digital Ltd/ }).click();
    const membersRequest = page.waitForRequest((request) =>
      request.url().includes('/api/v1/members'),
    );
    await page.goto('/admin/members');
    expect((await membersRequest).headers()['x-organization-id']).toBe(ORG_AKAGERA);
  });

  test('an administrator changes a role inline', async ({ page }) => {
    await signInAs(page);
    await page.goto('/admin/members');

    await page.getByRole('combobox', { name: 'Role of Diane Ingabire' }).click();
    await page.getByRole('option', { name: 'Member', exact: true }).click();

    await expect(page.getByText('Diane Ingabire is now Member.')).toBeVisible();
  });

  test('inviting an existing member shows the error on the email field', async ({ page }) => {
    await signInAs(page);
    await page.goto('/admin/invitations');

    await page.getByRole('button', { name: 'Invite someone' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite someone' });
    const email = dialog.getByLabel('Email');
    await email.fill('pm@kora.demo');
    await dialog.getByRole('button', { name: 'Send invitation' }).click();

    await expect(dialog.getByText('This person is already a member.')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  test('an invited person creates an account and joins', async ({ page }) => {
    await resetMockApi(page);
    await page.goto('/invitations/demo-invite-new-account-0001');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Join Akagera Digital Ltd' }),
    ).toBeVisible();
    await page.getByLabel('Full name').fill('New Person');
    await page.getByLabel('Password', { exact: true }).fill('a long enough passphrase');
    await page.getByRole('button', { name: 'Create account and join' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account menu for New Person' })).toBeVisible();
  });

  test('an existing user accepts with their password and gets a second organization', async ({
    page,
  }) => {
    await resetMockApi(page);
    await page.goto('/invitations/demo-invite-existing-account-0002');

    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Accept invitation' }).click();

    // The page switches to Eric's saved language (Kinyarwanda), so match the organization name only.
    await expect(page.getByRole('button', { name: /Virunga Build Partners/ })).toBeVisible();
  });
});
