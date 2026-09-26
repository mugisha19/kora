import { HttpParams } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';

export const API_BASE = environment.apiBaseUrl;

type QueryValue = string | number | boolean | null | undefined;

/**
 * Query object → HttpParams. Empty values are dropped (an empty `q` means "no filter"), and arrays
 * repeat the key, which is how the contract's `sort=field,dir` parameters are sent.
 */
export function toHttpParams(
  query: Record<string, QueryValue | readonly QueryValue[]>,
): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && item !== '') {
        params = params.append(key, String(item));
      }
    }
  }
  return params;
}

/** `If-Match` value for a resource `version` (the API's ETag is the quoted version). */
export function ifMatch(version: number): string {
  return `"${version}"`;
}

/** For 202/204 endpoints: callers only care that the request succeeded. */
export const toVoid = map((): void => undefined);
