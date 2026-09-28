import { setupWorker } from 'msw/browser';
import { broker, installMockBroker } from './broker';
import { db } from './db';
import { handlers } from './handlers';
import { after, before } from './outbox';

declare global {
  interface Window {
    /** Mock-mode helpers for developers and e2e tests. */
    koraMock?: { reset(): void; online(online: boolean): void };
  }
}

/**
 * Starts the Mock Service Worker that answers `/api/v1/*` in the browser. Other requests (the app's
 * own files, translations, icons) go to the network untouched.
 */
export async function startMockApi(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({
    // Absolute: a relative URL resolves against deep links (/admin/members) and the lookup fails.
    serviceWorker: { url: '/mockServiceWorker.js' },
    quiet: true,
    onUnhandledRequest: 'bypass',
  });
  // The outbox around every handled request, like the API's transactional outbox.
  worker.events.on('request:start', ({ request, requestId }) => before(requestId, request));
  worker.events.on('response:mocked', ({ request, requestId, response }) => {
    void after(requestId, request, response);
  });
  installMockBroker();
  window.koraMock = {
    reset: () => db.reset(),
    // Simulates losing and regaining the network for live updates.
    online: (online) => broker.setOnline(online),
  };
  console.info(
    '[mock api] Kora is running against the in-browser mock API (demo password: KoraDemo!2026).',
  );
}
