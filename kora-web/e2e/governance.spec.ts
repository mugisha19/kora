import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs, useEnglish } from './support';

/** Features 11–14: risks and the heat map, issues, stakeholders, change requests and approvals. */

const MOBILE = '7c1b2c3d-0000-4000-8000-000000000001';
const CR2 = '8d1b2c3d-0000-4000-8000-000000000002';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('risks', () => {
  test('the heat map filters the register, and a risk opens in its sheet', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/risks`);

    const heatmap = page.getByRole('table', { name: 'Open risks by probability and impact' });
    await expect(heatmap).toBeVisible();
    await expectNoA11yViolations(page);

    await heatmap
      .getByRole('button', { name: /Probability 4, impact 4: 1 risks, Critical/ })
      .click();
    await expect(page.getByText('Risks: 1')).toBeVisible();
    await expect(page).toHaveURL(/cell=4-4/);

    await page.getByRole('button', { name: /AKG-001-R1/ }).click();
    const sheet = page.getByRole('dialog', { name: /AKG-001-R1/ });
    await expect(sheet.getByText('Assessment history')).toBeVisible();
    await expect(page).toHaveURL(/\/risks\/[0-9a-f-]{36}\?cell=4-4/);
    await expectNoA11yViolations(page);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/risks\?cell=4-4$/);
  });

  test('a materialized risk becomes an issue in one step', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/risks`);

    await page.getByRole('button', { name: /AKG-001-R2/ }).click();
    const sheet = page.getByRole('dialog', { name: /AKG-001-R2/ });
    await sheet.getByRole('button', { name: 'It happened' }).click();
    const dialog = page.getByRole('dialog', { name: 'AKG-001-R2 happened' });
    await dialog.getByRole('button', { name: 'It happened' }).click();

    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]{36}$/);
    const issue = page.getByRole('dialog', { name: /AKG-001-I6/ });
    await expect(issue.getByRole('link', { name: 'The risk it materialized from' })).toBeVisible();
  });
});

test.describe('issues', () => {
  test('quick filters and resolving with a resolution', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/issues`);
    await expect(page.getByText('Escalated to the PMO')).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole('button', { name: 'Overdue' }).click();
    await expect(page.getByText('Issues: 1')).toBeVisible();

    await page.getByRole('button', { name: /AKG-001-I2/ }).click();
    const sheet = page.getByRole('dialog', { name: /AKG-001-I2/ });
    await sheet.getByRole('button', { name: 'Resolve' }).click();
    const resolve = page.getByRole('dialog', { name: 'Resolve AKG-001-I2' });
    await resolve.getByRole('textbox').fill('Switched to the backup region.');
    await resolve.getByRole('button', { name: 'Resolve' }).click();

    await expect(sheet.getByText('Switched to the backup region.')).toBeVisible();
    await expect(sheet.getByText('Resolved', { exact: true })).toBeVisible();
  });
});

test.describe('stakeholders', () => {
  test('the grid is reachable with the keyboard and passes axe', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/stakeholders`);

    const person = page
      .getByRole('region', { name: /^Manage closely/ })
      .getByRole('button', { name: 'Claudine Uwimana' });
    await expect(person).toBeVisible();
    await expectNoA11yViolations(page);

    await person.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Claudine Uwimana' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('change requests', () => {
  test('the PMO approves from the inbox, then as sponsor, and the change applies', async ({
    page,
  }) => {
    await signInAs(page, 'PMO');
    await useEnglish(page);

    await page.getByRole('link', { name: 'My approvals: 1 waiting' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'My approvals' })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('link', { name: /AKG-001-CR2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/change-requests/${CR2}$`));
    await expectNoA11yViolations(page);

    for (const comment of ['Within the PMO threshold after review', 'Go ahead']) {
      await page.getByRole('button', { name: 'Approve' }).click();
      const dialog = page.getByRole('dialog', { name: 'Approve AKG-001-CR2' });
      await dialog.getByRole('textbox').fill(comment);
      await dialog.getByRole('button', { name: 'Approve' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(comment)).toBeVisible();
    }

    await expect(page.getByRole('link', { name: 'My approvals: 0 waiting' })).toBeVisible();
    await page.goto(`/projects/${MOBILE}/charter`);
    await expect(
      page.getByText('Utility bill payments (electricity and water) (AKG-001-CR2)'),
    ).toBeVisible();
  });

  test('a member drafts and submits a change; the chain shows who decides', async ({ page }) => {
    await signInAs(page, 'Member');
    await useEnglish(page);
    await page.goto(`/projects/${MOBILE}/change-requests`);

    await page.getByRole('button', { name: 'New change request' }).click();
    const dialog = page.getByRole('dialog', { name: 'New change request' });
    await dialog.getByRole('textbox', { name: 'Title' }).fill('Add a savings goal');
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Customers asked for it');
    await dialog.getByRole('textbox', { name: 'Schedule change' }).fill('12');
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Save draft' }).click();

    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await page
      .getByRole('dialog', { name: /Submit AKG-001-CR6/ })
      .getByRole('button', { name: 'Submit for approval' })
      .click();
    await expect(page.getByText('Schedule change of 12 working days exceeds 10')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('change control', () => {
  test('an admin changes the approval thresholds', async ({ page }) => {
    await signInAs(page, 'Administrator');
    await page.goto('/admin/change-control');

    const pmoCost = page.getByRole('textbox', { name: /PMO approves above this cost/ });
    await expect(pmoCost).toHaveValue('5');
    await expectNoA11yViolations(page);
    await pmoCost.fill('8');
    await page.getByRole('button', { name: 'Save thresholds' }).click();
    await expect(page.getByText('Change-control thresholds saved.')).toBeVisible();
  });
});
