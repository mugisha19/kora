import { expect, test } from '@playwright/test';

/**
 * The in-browser mock API (MSW) is what the app talks to in mock mode and in these e2e tests.
 * This checks it is registered and follows the contract's conventions in a real browser.
 */
test.describe('mock API', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => window.koraMock?.reset());
  });

  test('answers contract calls with Problem Details and correlation ids', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/v1/organization', { headers: { 'X-Correlation-Id': 'e2e-1' } });
      return {
        status: res.status,
        header: res.headers.get('X-Correlation-Id'),
        body: await res.json(),
      };
    });

    expect(result).toMatchObject({
      status: 401,
      header: 'e2e-1',
      body: { code: 'auth.unauthenticated', correlationId: 'e2e-1' },
    });
  });

  test('keeps the refresh cookie across a reload, like the real session', async ({ page }) => {
    const signedIn = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'pm@kora.demo', password: 'KoraDemo!2026' }),
      });
      return res.status;
    });
    expect(signedIn).toBe(200);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const refreshed = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/refresh', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.email).toBe('pm@kora.demo');
  });
});
