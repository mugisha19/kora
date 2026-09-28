/**
 * Per-device preferences (theme, language, last organization) in localStorage.
 *
 * Storage can throw (private mode, blocked site data, quota), and a preference is never worth an
 * error screen, so every access is wrapped and failures fall back to "no stored value".
 * Only non-sensitive UI choices belong here: tokens never do (see feature 01).
 */
export const PREFERENCE_KEYS = {
  theme: 'kora.theme',
  language: 'kora.lang',
  organization: 'kora.org',
  /**
   * A hint, not a credential: this device had a session. Without it, start-up skips the silent
   * refresh (the refresh cookie is HttpOnly, so the page can't check for it) and shows sign-in at once.
   */
  signedIn: 'kora.signedIn',
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

export function readPreference(key: PreferenceKey): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePreference(key: PreferenceKey, value: string | null): void {
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    // Not persisted on this device; the choice still applies for this visit.
  }
}
