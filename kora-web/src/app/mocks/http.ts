import { HttpResponse, JsonBodyType } from 'msw';
import { ErrorCode, ProblemFieldError, Role } from '../core/api/api.models';
import { BREACHED_PASSWORDS } from './data';
import { db } from './db';

/** Matches the API on any origin (browser worker and unit tests alike). */
export const API = '*/api/v1';

export const ACCESS_TOKEN_SECONDS = 900;
export const REFRESH_COOKIE = 'kora_refresh';
/**
 * The real cookie is `HttpOnly; Secure; Path=/api/v1/auth`. MSW writes mocked cookies through
 * `document.cookie`, which can't set HttpOnly and only sees cookies for the page's path, so the mock
 * uses `Path=/`. The app never reads the cookie either way.
 */
const COOKIE_ATTRIBUTES = 'Path=/; SameSite=Strict';

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

const CORRELATION_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldError = ProblemFieldError;

/** Response builders that always echo `X-Correlation-Id`, like the API. */
export function reply(request: Request) {
  const sent = request.headers.get('X-Correlation-Id');
  const correlationId = sent && CORRELATION_PATTERN.test(sent) ? sent : crypto.randomUUID();
  const base = { 'X-Correlation-Id': correlationId };

  return {
    json(body: JsonBodyType, status = 200, headers: Record<string, string> = {}) {
      return HttpResponse.json(body, { status, headers: { ...base, ...headers } });
    },
    empty(status = 204, headers: Record<string, string> = {}) {
      return new HttpResponse(null, { status, headers: { ...base, ...headers } });
    },
    problem(
      status: number,
      code: ErrorCode,
      extra: { errors?: FieldError[]; detail?: string; headers?: Record<string, string> } = {},
    ) {
      return HttpResponse.json(
        {
          type: `urn:kora:problem:${code}`,
          title: TITLES[status] ?? 'Error',
          status,
          code,
          correlationId,
          instance: new URL(request.url).pathname,
          ...(extra.detail ? { detail: extra.detail } : {}),
          ...(extra.errors?.length ? { errors: extra.errors } : {}),
        },
        {
          status,
          headers: { ...base, 'Content-Type': 'application/problem+json', ...extra.headers },
        },
      );
    },
  };
}

export type Reply = ReturnType<typeof reply>;

/** Reads a JSON object body; anything else is a 400 on `body`. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function invalidBody(r: Reply): Response {
  return r.problem(400, 'validation.failed', {
    errors: [{ field: 'body', code: 'invalid', message: 'body must be a JSON object' }],
  });
}

/** Collects field errors with the contract's field-agnostic codes and params. */
export class Validator {
  readonly errors: FieldError[] = [];

  get ok(): boolean {
    return this.errors.length === 0;
  }

  /** Optional string: validated only when present. */
  string(field: string, value: unknown, min: number, max: number, required = true): boolean {
    if (value === undefined || value === null || value === '') {
      if (required) this.add(field, 'required', `${field} is required`);
      return !required;
    }
    if (typeof value !== 'string') return this.add(field, 'invalid', `${field} must be a string`);
    if (value.trim().length < min || value.length > max) {
      return this.add(field, 'length', `size must be between ${min} and ${max}`, { min, max });
    }
    return true;
  }

  email(field: string, value: unknown): boolean {
    if (!this.string(field, value, 3, 254)) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) {
      return this.add(field, 'email', 'must be a well-formed email address');
    }
    return true;
  }

  newPassword(field: string, value: unknown): boolean {
    if (!this.string(field, value, 12, 128)) return false;
    if (BREACHED_PASSWORDS.has(value as string)) {
      return this.add(field, 'password.breached', 'password appears in a breach list');
    }
    return true;
  }

  pattern(field: string, value: unknown, pattern: RegExp, required = false): boolean {
    if (value === undefined && !required) return true;
    if (typeof value !== 'string' || !pattern.test(value)) {
      return this.add(field, 'format', `must match ${pattern.source}`);
    }
    return true;
  }

  oneOf<T extends string>(
    field: string,
    value: unknown,
    allowed: readonly T[],
    required = true,
  ): boolean {
    if (value === undefined || value === null || value === '') {
      if (required) this.add(field, 'required', `${field} is required`);
      return !required;
    }
    if (!allowed.includes(value as T)) {
      return this.add(field, 'invalid', `must be one of ${allowed.join(', ')}`, {
        allowed: [...allowed],
      });
    }
    return true;
  }

  add(field: string, code: string, message: string, params?: Record<string, unknown>): false {
    this.errors.push(params ? { field, code, message, params } : { field, code, message });
    return false;
  }

  problem(r: Reply): Response {
    return r.problem(400, 'validation.failed', { errors: this.errors });
  }
}

/** True for IANA time zone ids such as `Africa/Kigali`. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// ---------- Auth ----------

export function issueAccessToken(userId: string, now = Date.now()): string {
  return `mock.${userId}.${now + ACCESS_TOKEN_SECONDS * 1000}.${crypto.randomUUID()}`;
}

/** The signed-in user id, or a 401 `auth.unauthenticated`. */
export function authenticate(request: Request, r: Reply, now = Date.now()): string | Response {
  const header = request.headers.get('Authorization') ?? '';
  const [, userId, expiresAt] = /^Bearer mock\.([^.]+)\.(\d+)\./.exec(header) ?? [];
  if (!userId || Number(expiresAt) <= now || !db.user(userId)) {
    return r.problem(401, 'auth.unauthenticated');
  }
  return userId;
}

/** Starts a new refresh-token family (sign-in) or continues one (rotation). */
export function refreshCookie(userId: string, familyId: string = crypto.randomUUID()): string {
  const token = crypto.randomUUID();
  db.state.refreshTokens.push({ token, userId, familyId, status: 'active' });
  db.save();
  return `${REFRESH_COOKIE}=${token}; Max-Age=${7 * 86_400}; ${COOKIE_ATTRIBUTES}`;
}

export function clearedRefreshCookie(): string {
  return `${REFRESH_COOKIE}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}

/** 200/201 SessionResponse with a fresh access token and refresh cookie. */
export function sessionResponse(
  r: Reply,
  userId: string,
  status = 200,
  familyId?: string,
): Response {
  return r.json(
    {
      accessToken: issueAccessToken(userId),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_SECONDS,
      user: db.me(userId),
    },
    status,
    { 'Set-Cookie': refreshCookie(userId, familyId) },
  );
}

// ---------- Tenancy and roles ----------

/** The caller's membership in the organization named by `X-Organization-Id`. */
export function tenant(request: Request, r: Reply, userId: string) {
  const organizationId = request.headers.get('X-Organization-Id') ?? '';
  if (!UUID_PATTERN.test(organizationId)) return r.problem(400, 'tenant.header_invalid');
  const membership = db.membership(userId, organizationId);
  return membership ?? r.problem(403, 'tenant.forbidden');
}

export function requireRole(r: Reply, role: Role, allowed: readonly Role[]): Response | null {
  return allowed.includes(role) ? null : r.problem(403, 'access.denied');
}

/** 400 for a path id that isn't a UUID (Spring rejects it while binding, before the role check). */
export function checkPathId(r: Reply, field: string, value: unknown): Response | null {
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? null
    : r.problem(400, 'validation.failed', {
        errors: [{ field, code: 'format', message: 'must be a UUID' }],
      });
}

// ---------- Optimistic locking ----------

/*
 * Check order of versioned updates, as the API does it (Spring binds and validates the request
 * before the use case runs):
 *   401 → tenant 400/403 → 428 If-Match missing/malformed → 400 body shape → 403 role → 404
 *   → 412 stale version → 400 domain validation → 409 domain conflict
 * So the role check never depends on whether an id exists.
 */

/** The version in `If-Match: "<n>"` (weak `W/` accepted), or 428 when missing or malformed. */
export function ifMatchVersion(request: Request, r: Reply): number | Response {
  const header = request.headers.get('If-Match')?.trim() ?? '';
  const match = /^(?:W\/)?"(\d+)"$/.exec(header);
  return match ? Number(match[1]) : r.problem(428, 'concurrency.if_match_required');
}

/** 412 when the version the client edited is no longer the current one. */
export function checkVersion(r: Reply, sent: number, current: number): Response | null {
  return sent === current ? null : r.problem(412, 'concurrency.stale_version');
}

export function etag(version: number): Record<string, string> {
  return { ETag: `"${version}"` };
}

// ---------- Paging and sorting ----------

export interface Paging {
  page: number;
  size: number;
  sort: { field: string; direction: 1 | -1 }[];
}

/** Parses `page`, `size` (capped at 100) and repeatable `sort`, rejecting unknown sort fields. */
export function paging(
  url: URL,
  allowedSort: readonly string[],
  defaultSort: string,
  validator: Validator,
): Paging {
  const page = Number(url.searchParams.get('page') ?? 0);
  const size = Number(url.searchParams.get('size') ?? 20);
  if (!Number.isInteger(page) || page < 0)
    validator.add('page', 'range', 'must be >= 0', { min: 0 });
  if (!Number.isInteger(size) || size < 1)
    validator.add('size', 'range', 'must be >= 1', { min: 1 });

  const requested = url.searchParams.getAll('sort');
  const sort: Paging['sort'] = [];
  for (const value of requested.length ? requested : [defaultSort]) {
    const [field, direction = 'asc'] = value.split(',');
    if (!/^[A-Za-z]+(,(asc|desc))?$/.test(value) || !allowedSort.includes(field)) {
      validator.add('sort', 'invalid', `sort by one of ${allowedSort.join(', ')}`, {
        allowed: [...allowedSort],
      });
      break;
    }
    sort.push({ field, direction: direction === 'desc' ? -1 : 1 });
  }
  return { page: Math.max(0, page), size: Math.min(Math.max(1, size), 100), sort };
}

export function sortAndPage<T>(
  items: T[],
  { page, size, sort }: Paging,
  keys: Record<string, (item: T) => string | number>,
) {
  const sorted = [...items].sort((a, b) => {
    for (const { field, direction } of sort) {
      const key = keys[field];
      const x = key(a);
      const y = key(b);
      const order =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { sensitivity: 'base' });
      if (order !== 0) return order * direction;
    }
    return 0;
  });
  return {
    content: sorted.slice(page * size, page * size + size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}
