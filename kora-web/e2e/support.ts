import { Page, expect } from '@playwright/test';

export const DEMO_PASSWORD = 'KoraDemo!2026';
export const ORG_AKAGERA = '0b7c5a52-5c2e-4f0e-9a51-1f6d2c3b4a01';

export type DemoRole = 'Administrator' | 'PMO' | 'Project manager' | 'Member' | 'Viewer';

/** Fresh demo data in the in-browser mock API (each test gets its own browser context anyway). */
export async function resetMockApi(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await page.evaluate(() => window.koraMock?.reset());
}

/** Signs in with a one-click demo account and waits for the dashboard (in the user's language). */
export async function signInAs(page: Page, role: DemoRole = 'Administrator'): Promise<void> {
  await resetMockApi(page);
  await page.getByRole('button', { name: new RegExp(`^${role} `) }).click();
  // Any language: the user's profile locale applies on sign-in.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
}

/**
 * Switches the UI to English. Some demo users have a French or Kinyarwanda profile, and signing in
 * applies it; tests written against English labels switch back first.
 */
export async function useEnglish(page: Page): Promise<void> {
  const current = page.getByRole('button', { name: /language|langue|ururimi/i });
  if ((await current.getAttribute('aria-label'))?.includes('English')) return;
  await current.click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Change language/ })).toBeVisible();
}

/** Opens the navigation drawer on phones, where the side navigation is hidden. */
export async function openNavigation(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole('button', { name: 'Open navigation menu' }).click();
}

declare global {
  interface Window {
    koraMock?: { reset(): void };
  }
}
