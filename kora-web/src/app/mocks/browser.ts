import { setupWorker } from 'msw/browser';
import { db } from './db';
import { handlers } from './handlers';

declare global {
  interface Window {
    /** Mock-mode helpers for developers and e2e tests. */
    koraMock?: { reset(): void };
  }
}

/**
 * Starts the Mock Service Worker that answers `/api/v1/*` in the browser. Other requests (the app's
 * own files, translations, icons) go to the network untouched.
 */
export async function startMockApi(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({
    serviceWorker: { url: 'mockServiceWorker.js' },
    quiet: true,
    onUnhandledRequest: 'bypass',
  });
  window.koraMock = { reset: () => db.reset() };
  console.info(
    '[mock api] Kora is running against the in-browser mock API (demo password: KoraDemo!2026).',
  );
}
