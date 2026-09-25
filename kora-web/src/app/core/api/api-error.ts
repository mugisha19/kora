import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail, ProblemFieldError } from './api.models';

/** Normalized error every feature works with, whatever went wrong on the wire. */
export interface ApiError {
  /** HTTP status; 0 when the request never reached the server. */
  readonly status: number;
  /** Stable machine code, e.g. `members.last_admin`; falls back to `http.<status>`. */
  readonly code: string;
  readonly title?: string;
  readonly detail?: string;
  readonly correlationId?: string;
  readonly fieldErrors: readonly ProblemFieldError[];
  /** Seconds, from the `Retry-After` header on 429/503. */
  readonly retryAfter?: number;
}

export const NETWORK_ERROR_CODE = 'network.offline';
export const UNKNOWN_ERROR_CODE = 'unknown';

function isProblem(body: unknown): body is ProblemDetail {
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

  return {
    status: -1,
    code: UNKNOWN_ERROR_CODE,
    detail: error instanceof Error ? error.message : undefined,
    fieldErrors: [],
  };
}
