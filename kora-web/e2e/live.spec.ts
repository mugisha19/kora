import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { signInAs, useEnglish } from './support';

/** Features 18–21: notifications and live updates, history, attachments, audit and reports. */

const MOBILE = '7c1b2c3d-0000-4000-8000-000000000001';
const AKAGERA = '0b7c5a52-5c2e-4f0e-9a51-1f6d2c3b4a01';
const MEMBER = '6f1e2d3c-4b5a-4c6d-8e7f-000000000004';

/** The mock API's helpers on window (mock mode only). */
type MockWindow = Window & { koraMock?: { online(online: boolean): void } };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('notifications', () => {
  test('the bell opens my notifications, and one opens its task over the board', async ({
    page,
  }) => {
    await signInAs(page, 'Member');
    await useEnglish(page);

    const bell = page.getByRole('button', { name: 'Notifications: 2 unread' });
    await bell.click();
    const sheet = page.getByRole('dialog', { name: 'Notifications' });
    await expect(sheet.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expectNoA11yViolations(page);

    await sheet.getByRole('link', { name: /assigned you AKG-001-49/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${MOBILE}/board/[0-9a-f-]{36}$`));
    const task = page.getByRole('dialog', { name: /AKG-001-49/ });
    await task.getByRole('button', { name: 'Change history' }).click();
    await expect(task.getByText('Assignee')).toBeVisible();
    await expectNoA11yViolations(page);
    // Closing the sheet goes back to the board; the one opened is now read.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/projects/${MOBILE}/board$`));
    await expect(page.getByRole('button', { name: 'Notifications: 1 unread' })).toBeVisible();
  });

  test('changes by others arrive live; a lost connection shows a banner and catches up', async ({
    page,
  }) => {
    await signInAs(page, 'Member');
    await useEnglish(page);
    await page.goto(`/projects/${MOBILE}/activity`);
    const today = page.getByRole('region', { name: 'Today' });
    await expect(today).toBeVisible();
    await expectNoA11yViolations(page);

    // The project manager assigns a task (their own session, through the mock API).
    const status = await page.evaluate(
      async ({ org, member }) => {
        const login = await fetch('/api/v1/auth/login', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'pm@kora.demo', password: 'KoraDemo!2026' }),
        }).then((r) => r.json());
        const headers = {
          Authorization: `Bearer ${login.accessToken}`,
          'X-Organization-Id': org,
          'Content-Type': 'application/json',
        };
        const page = await fetch(
          '/api/v1/projects/7c1b2c3d-0000-4000-8000-000000000001/tasks?size=100',
          {
            headers,
            credentials: 'omit',
          },
        ).then((r) => r.json());
        const tasks: { id: string; key: string; version: number }[] = page.content ?? page;
        const task = tasks.find((t) => t.key === 'AKG-001-45')!;
        const res = await fetch(`/api/v1/tasks/${task.id}`, {
          method: 'PATCH',
          credentials: 'omit',
          headers: { ...headers, 'If-Match': `"${task.version}"` },
          body: JSON.stringify({ assigneeId: member }),
        });
        return res.status;
      },
      { org: AKAGERA, member: MEMBER },
    );
    expect(status).toBe(200);
    await expect(today.getByRole('listitem').first()).toContainText('AKG-001-45');
    await expect(page.getByRole('button', { name: 'Notifications: 3 unread' })).toBeVisible();

    await page.evaluate(() => (window as MockWindow).koraMock?.online(false));
    await expect(
      page.getByRole('status').filter({ hasText: 'Live updates are paused' }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
    await page.evaluate(() => (window as MockWindow).koraMock?.online(true));
    await expect(page.getByText('Live updates are paused')).toHaveCount(0);
  });
});

test.describe('files and reports', () => {
  test('a file uploads with progress from the keyboard-reachable button', async ({ page }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/overview`);

    const files = page.getByRole('region', { name: 'Files' });
    await expect(files.getByRole('button', { name: 'Download Signed charter.pdf' })).toBeVisible();
    await expectNoA11yViolations(page);

    const chooser = page.waitForEvent('filechooser');
    await files.getByRole('button', { name: 'Choose files' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'Launch plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nlaunch\n%%EOF'),
    });
    await expect(files.getByRole('button', { name: 'Download Launch plan.pdf' })).toBeVisible();

    const download = page.waitForEvent('download');
    await files.getByRole('button', { name: 'Download Launch plan.pdf' }).click();
    expect((await download).suggestedFilename()).toBe('Launch plan.pdf');
  });

  test('a report exported from a page is made in the background and downloads', async ({
    page,
  }) => {
    await signInAs(page, 'Project manager');
    await page.goto(`/projects/${MOBILE}/evm`);

    await page.getByRole('button', { name: 'Export the earned value report' }).click();
    await page.getByRole('menuitem', { name: 'PDF, for reading' }).click();
    await page.getByRole('button', { name: 'My reports' }).click();

    await expect(page).toHaveURL(/\/reports$/);
    const mine = page.getByRole('region', { name: 'My reports' });
    const download = mine.getByRole('button', { name: /^Download earned-value-AKG-001-/ });
    await expect(download).toBeVisible({ timeout: 10_000 });
    await expectNoA11yViolations(page);
    const file = page.waitForEvent('download');
    await download.click();
    expect((await file).suggestedFilename()).toMatch(/^earned-value-AKG-001-.+\.pdf$/);
  });
});

test.describe('audit log', () => {
  test('the administrator filters the log, opens a change and checks the chain', async ({
    page,
  }) => {
    await signInAs(page, 'Administrator');
    await page.goto('/admin/audit');

    const log = page.getByRole('table', { name: 'Audit log' });
    await expect(log.getByRole('row').nth(1)).toContainText('Task changed');
    await expectNoA11yViolations(page);

    await log.getByRole('button', { name: 'Details: Task changed' }).first().click();
    await expect(log.getByRole('table', { name: 'Changes: Task changed' }).first()).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole('combobox', { name: 'Kind' }).click();
    await page.getByRole('option', { name: 'Access denied' }).click();
    await expect(page).toHaveURL(/kind=denied/);
    await expect(log.getByRole('row')).toHaveCount(2);

    await page.getByRole('button', { name: 'Check for tampering' }).click();
    await expect(page.getByText(/The record is intact/)).toBeVisible();
  });
});
