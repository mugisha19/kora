import { vi } from 'vitest';

// Global unit-test setup (runs before every spec file).
// Testing Library unmounts rendered components after each test automatically when `afterEach` is global.

// Page tests go through the real interceptors, the mock API and lazy-loaded routes, with coverage
// instrumentation and every spec file in one worker: 5 s per test is too tight on a busy machine.
// (Testing Library's own `findBy…` timeout can't be set here: each spec bundle has its own copy;
// pass `{ timeout }` to a query that waits on a navigation.)
vi.setConfig({ testTimeout: 20_000 });
