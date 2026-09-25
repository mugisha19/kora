export interface Environment {
  /** Production build: stricter logging, no demo shortcuts. */
  readonly production: boolean;
  /** Base URL of the Kora API; relative so the dev proxy and Nginx can route it. */
  readonly apiBaseUrl: string;
  /** Serve API calls from the in-browser MSW mock instead of a real backend. */
  readonly useMocks: boolean;
  /** Show one-click demo accounts on the sign-in page (feature 22). */
  readonly showDemoLogins: boolean;
  /** API contract version this build was written against. */
  readonly contractVersion: string;
  readonly appVersion: string;
}
