import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env['CI']);

/**
 * End-to-end tests run against the Angular dev server in mock mode (MSW), so they need no backend
 * until the API phases land; a later profile will point them at the real API.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: isCi ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Lets a machine with a pre-installed Chromium (e.g. a locked-down sandbox) skip `playwright install`.
        launchOptions: { executablePath: process.env['PW_CHROMIUM_PATH'] || undefined },
      },
    },
    {
      // 375 px is the narrowest width every screen must support.
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 375, height: 812 },
        launchOptions: { executablePath: process.env['PW_CHROMIUM_PATH'] || undefined },
      },
    },
  ],
  webServer: {
    command: 'npm run start -- --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
