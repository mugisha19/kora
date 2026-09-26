import type { Role } from '../app/core/api/api.models';

export interface DemoLogins {
  readonly password: string;
  readonly accounts: readonly { readonly email: string; readonly role: Role }[];
}

export interface Environment {
  /** Production build: stricter logging, no demo shortcuts. */
  readonly production: boolean;
  /** Base URL of the Kora API; relative so the dev proxy and Nginx can route it. */
  readonly apiBaseUrl: string;
  /** Serve API calls from the in-browser MSW mock instead of a real backend. */
  readonly useMocks: boolean;
  /**
   * One-click demo accounts on the sign-in page (feature 22). Only set where demo data exists, so
   * the demo password never ships in a production bundle.
   */
  readonly demoLogins?: DemoLogins;
  /** API contract version this build was written against. */
  readonly contractVersion: string;
  readonly appVersion: string;
}
