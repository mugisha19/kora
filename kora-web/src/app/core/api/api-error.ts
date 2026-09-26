import { HttpErrorResponse } from '@angular/common/http';
import { ErrorCode, ProblemDetail, ProblemFieldError } from './api.models';

export const NETWORK_ERROR_CODE = 'network.offline';
export const UNKNOWN_ERROR_CODE = 'unknown';

/**
 * Contract codes plus the client-side ones. `(string & {})` keeps editor completion for the known
 * codes while accepting codes a newer API adds (the contract says to fall back for unknown codes).
 */
export type ApiErrorCode =
  ErrorCode | typeof NETWORK_ERROR_CODE | typeof UNKNOWN_ERROR_CODE | (string & {});

/** Field problem as the UI uses it; `message` is the API's English developer text, never shown. */
export type ApiFieldError = Pick<ProblemFieldError, 'field' | 'code' | 'params'> & {
  message?: string;
};

/** Normalized error every feature works with, whatever went wrong on the wire. */
export interface ApiError {
  /** HTTP status; 0 when the request never reached the server, -1 for non-HTTP failures. */
  readonly status: number;
  /** Stable machine code, e.g. `members.last_admin`; falls back to `http.<status>`. */
  readonly code: ApiErrorCode;
  readonly title?: string;
  readonly detail?: string;
  readonly correlationId?: string;
  readonly fieldErrors: readonly ApiFieldError[];
  /** Seconds, from the `Retry-After` header on 429/503. */
  readonly retryAfter?: number;
}

function isProblem(body: unknown): body is Partial<ProblemDetail> & { status: number } {
  return typeof body === 'object' && body !== null && 'status' in body;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.round((date - Date.now()) / 1000));
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'code' in value &&
    'fieldErrors' in value
  );
}

/** Converts anything thrown by HttpClient (or code around it) into an {@link ApiError}. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { status: 0, code: NETWORK_ERROR_CODE, fieldErrors: [] };
    }
    const problem = isProblem(error.error) ? error.error : undefined;
    return {
      status: error.status,
      code: problem?.code ?? `http.${error.status}`,
      title: problem?.title,
      detail: problem?.detail,
      correlationId: problem?.correlationId ?? error.headers?.get('X-Correlation-Id') ?? undefined,
      fieldErrors: problem?.errors ?? [],
      retryAfter: parseRetryAfter(error.headers?.get('Retry-After') ?? null),
    };
  }

  // Angular's resource() wraps a non-Error rejection (our ApiError objects) in an Error whose
  // `cause` is the original; unwrap it so the real code isn't lost.
  if (error instanceof Error && error.cause !== undefined && error.cause !== error) {
    const inner = toApiError(error.cause);
    if (inner.code !== UNKNOWN_ERROR_CODE) return inner;
  }

  return {
    status: -1,
    code: UNKNOWN_ERROR_CODE,
    detail: error instanceof Error ? error.message : undefined,
    fieldErrors: [],
  };
}
