import { HttpContext, HttpContextToken, HttpRequest } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** Skip the global error toast; the caller shows the error itself (forms, dialogs). */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

/** Don't drive the global progress bar (background polling, silent refresh). */
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

/** Request is part of the auth flow itself: no bearer token, no refresh-on-401. */
export const AUTH_REQUEST = new HttpContextToken<boolean>(() => false);

export function silent(context = new HttpContext()): HttpContext {
  return context.set(SILENT_ERRORS, true);
}

/** Context for the public/auth endpoints (login, refresh, invitation links…). */
export function authFlow(context = new HttpContext()): HttpContext {
  return context.set(AUTH_REQUEST, true);
}

export function isApiRequest(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith(environment.apiBaseUrl);
}

/** Paths that must never carry `X-Organization-Id` (the contract marks them not tenant-scoped). */
export function isTenantFreePath(url: string): boolean {
  const path = url.slice(environment.apiBaseUrl.length);
  return path.startsWith('/auth/') || path.startsWith('/invitations/token/') || path === '/me';
}
