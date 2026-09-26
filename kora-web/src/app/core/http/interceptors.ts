import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  retry,
  switchMap,
  throwError,
  timer,
} from 'rxjs';
import { ApiError, toApiError } from '../api/api-error';
import {
  AUTH_REQUEST,
  SILENT_ERRORS,
  SKIP_LOADING,
  isApiRequest,
  isTenantFreePath,
} from '../api/http-context';
import { ErrorMessages } from '../errors/error-messages';
import { Notifier } from '../notify/notifier';
import { SessionRefresher } from '../session/session-refresher';
import { SessionStore } from '../session/session.store';
import { LoadingService } from './loading.service';

/*
 * The HTTP pipeline is a Chain of Responsibility: each interceptor does one job and passes the
 * request on. Order (outermost first), set in `provideApi()`:
 *
 *   correlation id → loading → error toast → retry → auth → tenant → network
 *
 * - The correlation id is outermost so every retry and refresh-retry carries the same id.
 * - The error toast sits outside retry and auth, so it only sees errors that survived both.
 * - Retry sits outside auth, so a retried request gets a fresh token if one was refreshed meanwhile.
 */

export const CORRELATION_HEADER = 'X-Correlation-Id';
export const TENANT_HEADER = 'X-Organization-Id';

/** Tags every API request with an id the API echoes in its logs and in Problem Details. */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req) || req.headers.has(CORRELATION_HEADER)) return next(req);
  return next(req.clone({ setHeaders: { [CORRELATION_HEADER]: crypto.randomUUID() } }));
};

/** Drives the global progress bar. */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req) || req.context.get(SKIP_LOADING)) return next(req);
  const loading = inject(LoadingService);
  loading.begin();
  return next(req).pipe(finalize(() => loading.end()));
};

/**
 * Normalizes every API failure to an {@link ApiError} and decides whether it deserves a toast:
 * - reads (GET) never toast: the screen that asked shows an error state with a retry button;
 * - 401 never toasts: the auth layer handles it (refresh, or "session expired");
 * - validation errors with field details don't toast: the form shows them next to the fields;
 * - requests marked `SILENT_ERRORS` handle their errors themselves.
 */
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req)) return next(req);
  const notifier = inject(Notifier);
  const messages = inject(ErrorMessages);
  return next(req).pipe(
    catchError((error: unknown) => {
      const apiError = toApiError(error);
      if (shouldToast(req, apiError)) {
        notifier.error(messages.message(apiError), apiError.correlationId);
      }
      return throwError(() => apiError);
    }),
  );
};

function shouldToast(req: HttpRequest<unknown>, error: ApiError): boolean {
  if (req.context.get(SILENT_ERRORS)) return false;
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  if (error.status === 401) return false;
  return !(error.code === 'validation.failed' && error.fieldErrors.length > 0);
}

export interface RetryPolicy {
  /** Extra attempts after the first failure. */
  readonly maxRetries: number;
  /** Delay before retry n is `baseDelayMs * 2^(n-1)` (exponential backoff). */
  readonly baseDelayMs: number;
  /** A 429 is retried only when the server asks to wait at most this long. */
  readonly maxRetryAfterSeconds: number;
}

export const RETRY_POLICY = new InjectionToken<RetryPolicy>('RETRY_POLICY', {
  providedIn: 'root',
  factory: () => ({ maxRetries: 2, baseDelayMs: 400, maxRetryAfterSeconds: 5 }),
});

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Transient failures: offline blip, rate limit, gateway/unavailable while the API restarts. */
const RETRYABLE_STATUSES = new Set([0, 429, 502, 503, 504]);

/**
 * Retries transient failures of idempotent requests only: repeating a POST could create a second
 * invitation, so writes are never retried automatically.
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req) || !IDEMPOTENT_METHODS.has(req.method)) return next(req);
  const policy = inject(RETRY_POLICY);
  return next(req).pipe(
    retry({
      count: policy.maxRetries,
      delay: (error: unknown, attempt: number) => {
        if (!(error instanceof HttpErrorResponse) || !RETRYABLE_STATUSES.has(error.status)) {
          return throwError(() => error);
        }
        if (error.status === 429) {
          const wait = toApiError(error).retryAfter ?? Infinity;
          return wait <= policy.maxRetryAfterSeconds ? timer(wait * 1000) : throwError(() => error);
        }
        return timer(policy.baseDelayMs * 2 ** (attempt - 1));
      },
    }),
  );
};

/** Refresh this long before expiry, so a request never leaves with a token about to lapse. */
export const PROACTIVE_REFRESH_MS = 10_000;

/**
 * Attaches the in-memory access token. Refreshes proactively when it is about to expire, and
 * reactively on a 401, then replays the request once. Auth-flow requests (login, refresh…) pass
 * through untouched, which is also what stops a failing refresh from triggering another refresh.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req) || req.context.get(AUTH_REQUEST)) return next(req);
  const store = inject(SessionStore);
  const refresher = inject(SessionRefresher);

  const send = (token: string | null) =>
    next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  const current = store.accessToken();
  const token$: Observable<string | null> =
    current && store.expiresWithin(PROACTIVE_REFRESH_MS)
      ? refresher.refresh().pipe(map((session) => session.accessToken))
      : of(current);

  return token$.pipe(
    switchMap((token) =>
      send(token).pipe(
        catchError((error: unknown) => {
          // Only a request that carried a token can be saved by refreshing it.
          if (!token || !(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          // Another request may already have refreshed while this one was in flight.
          const latest = store.accessToken();
          const fresh$ =
            latest && latest !== token
              ? of(latest)
              : refresher.refresh().pipe(map((session) => session.accessToken));
          return fresh$.pipe(switchMap((fresh) => send(fresh)));
        }),
      ),
    ),
  );
};

/** Adds the active organization to tenant-scoped API calls (an explicit header wins). */
export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req) || isTenantFreePath(req.url) || req.headers.has(TENANT_HEADER)) {
    return next(req);
  }
  const organizationId = inject(SessionStore).activeOrganizationId();
  return next(
    organizationId ? req.clone({ setHeaders: { [TENANT_HEADER]: organizationId } }) : req,
  );
};

/** The chain, outermost first. */
export const API_INTERCEPTORS: HttpInterceptorFn[] = [
  correlationIdInterceptor,
  loadingInterceptor,
  errorToastInterceptor,
  retryInterceptor,
  authInterceptor,
  tenantInterceptor,
];
