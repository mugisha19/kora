import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { NETWORK_ERROR_CODE, UNKNOWN_ERROR_CODE, isApiError, toApiError } from './api-error';

function httpError(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new HttpErrorResponse({ status, error: body, headers: new HttpHeaders(headers) });
}

describe('toApiError', () => {
  it('maps a Problem Details body to a normalized error', () => {
    const error = toApiError(
      httpError(409, {
        status: 409,
        title: 'Conflict',
        detail: 'Keep at least one admin',
        code: 'members.last_admin',
        correlationId: 'c-1',
        errors: [{ field: 'role', code: 'members.last_admin' }],
      }),
    );

    expect(error).toEqual({
      status: 409,
      code: 'members.last_admin',
      title: 'Conflict',
      detail: 'Keep at least one admin',
      correlationId: 'c-1',
      fieldErrors: [{ field: 'role', code: 'members.last_admin' }],
      retryAfter: undefined,
    });
  });

  it('treats status 0 as the network being unreachable', () => {
    expect(toApiError(httpError(0, null))).toEqual({
      status: 0,
      code: NETWORK_ERROR_CODE,
      fieldErrors: [],
    });
  });

  it('falls back to an http.<status> code and the correlation id header when the body is not a problem', () => {
    const error = toApiError(
      httpError(502, '<html>Bad gateway</html>', { 'X-Correlation-Id': 'c-2' }),
    );

    expect(error.code).toBe('http.502');
    expect(error.correlationId).toBe('c-2');
    expect(error.fieldErrors).toEqual([]);
  });

  it('reads Retry-After given in seconds', () => {
    const error = toApiError(
      httpError(429, { status: 429, code: 'rate_limited' }, { 'Retry-After': '30' }),
    );

    expect(error.retryAfter).toBe(30);
  });

  it('reads Retry-After given as an HTTP date', () => {
    const inOneMinute = new Date(Date.now() + 60_000).toUTCString();
    const error = toApiError(httpError(503, null, { 'Retry-After': inOneMinute }));

    expect(error.retryAfter).toBeGreaterThanOrEqual(58);
    expect(error.retryAfter).toBeLessThanOrEqual(60);
  });

  it('ignores an unparseable Retry-After', () => {
    expect(toApiError(httpError(429, null, { 'Retry-After': 'soon' })).retryAfter).toBeUndefined();
  });

  it('returns an ApiError unchanged', () => {
    const original = toApiError(httpError(404, { status: 404, code: 'resource.not_found' }));

    expect(toApiError(original)).toBe(original);
    expect(isApiError(original)).toBe(true);
  });

  it('wraps non-HTTP errors as unknown, keeping the message', () => {
    expect(toApiError(new Error('boom'))).toEqual({
      status: -1,
      code: UNKNOWN_ERROR_CODE,
      detail: 'boom',
      fieldErrors: [],
    });
    expect(toApiError('weird').detail).toBeUndefined();
    expect(isApiError(null)).toBe(false);
  });
});
