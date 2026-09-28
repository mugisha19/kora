import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs, switchUser, useEnglish } from './support';

/**
 * End-to-end journeys across features and people (Phase 10): what a week in Kora looks like, with
 * each person picking up where the previous one left off.
 */

const MOBILE = '7c1b2c3d-0000-4000-8000-000000000001';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('a week of work: time logged, approved, reported, and the member told', async ({ page }) => {
  // Several people and pages in one story.
  test.setTimeout(90_000);

  // The member finishes the week's timesheet and submits it (feature 15).
  await signInAs(page, 'Member');
  await useEnglish(page);
  await page.goto('/timesheets');
  const week =
    (await page.getByRole('heading', { level: 2, name: /^Week \d+/ }).textContent()) ?? '';
  const weekNumber = /Week (\d+)/.exec(week)?.[1] ?? '';
  await page
    .getByRole('textbox', { name: /^AKG-001-49, / })
    .nth(2)
    .fill('7.5');
  await expect(page.getByText('All changes saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit week' }).click();
  await page
    .getByRole('dialog', { name: 'Submit this week?' })
    .getByRole('button', { name: 'Submit week' })
    .click();
  await expect(page.getByText(/This week is submitted/)).toBeVisible();

  // The project manager approves it (features 15, 18, 19).
  await switchUser(page, 'Project manager');
  await page.goto(`/projects/${MOBILE}/time`);
  const approvals = page.getByRole('region', { name: 'Timesheets to approve' });
  // Oldest week first: this week is the member's last one listed.
  await approvals
    .getByRole('button', { name: 'Approve the timesheet of Eric Nshimiyimana' })
    .last()
    .click();
  await expect(
    page.getByText(new RegExp(`Week ${weekNumber} of Eric Nshimiyimana approved`)),
  ).toBeVisible();

  // It shows in the project's activity, and the status report can go to the sponsor (feature 21).
  await page.goto(`/projects/${MOBILE}/activity`);
  await expect(
    page.getByRole('region', { name: 'Today' }).getByRole('listitem').first(),
  ).toContainText(/Grace Mukamana\s+updated\s+timesheet/);
  await page.goto(`/projects/${MOBILE}/overview`);
  await page.getByRole('button', { name: 'Export the project status report' }).click();
  await page.getByRole('menuitem', { name: 'PDF, for reading' }).click();
  await page.getByRole('button', { name: 'My reports' }).click();
  const report = page
    .getByRole('region', { name: 'My reports' })
    .getByRole('button', { name: /^Download project-status-AKG-001-/ });
  await expect(report).toBeVisible({ timeout: 10_000 });
  await expectNoA11yViolations(page);

  // The member finds out from a notification and opens the approved week (feature 18).
  await switchUser(page, 'Member');
  await page.getByRole('button', { name: /^Notifications: \d+ unread$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  await sheet
    .getByRole('link', { name: `Grace Mukamana approved your time for week ${weekNumber}` })
    .click();
  await expect(page).toHaveURL(new RegExp(`/timesheets/\\d{4}-W${weekNumber}$`));
  await expect(page.getByRole('list', { name: 'Status per project' })).toContainText('Approved');
  await expectNoA11yViolations(page);
});
