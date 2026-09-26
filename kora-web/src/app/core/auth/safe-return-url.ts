export const DEFAULT_AFTER_SIGN_IN = '/dashboard';

function hasControlOrSpace(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f || /\s/.test(char);
  });
}

/** Pages that make no sense to return to after signing in. */
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * The URL to go to after sign-in, from an untrusted `?returnUrl=`. Only same-app paths are allowed
 * (open-redirect protection, OWASP A01): absolute URLs, protocol-relative `//evil.example`,
 * backslash tricks (`/\evil.example`, which browsers treat like `//`) and control characters all
 * fall back to the dashboard.
 */
export function safeReturnUrl(candidate: string | null | undefined): string {
  if (!candidate?.startsWith('/') || /^\/[/\\]/.test(candidate)) return DEFAULT_AFTER_SIGN_IN;
  // Control characters and whitespace (tab, newline) can smuggle a second URL into the path.
  if (hasControlOrSpace(candidate)) return DEFAULT_AFTER_SIGN_IN;

  const base = 'https://kora.invalid';
  let url: URL;
  try {
    url = new URL(candidate, base);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (url.origin !== base) return DEFAULT_AFTER_SIGN_IN;
  if (AUTH_PAGES.some((page) => url.pathname === page)) return DEFAULT_AFTER_SIGN_IN;
  return `${url.pathname}${url.search}${url.hash}`;
}
