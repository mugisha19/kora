# 0005 — REST API conventions

- Status: Accepted
- Date: 2026-09-25

## Context

Every feature adds endpoints, and the web client handles them all with shared machinery (interceptors,
generated types, one error-toast mapping). If each module invented its own error format, paging or
concurrency scheme, that machinery would fill up with special cases. The conventions were agreed with the web
session before either side wrote code, and are encoded in `docs/openapi.yaml`.

## Decision

**Base path and versioning.** Everything under `/api/v1`. Additive changes (new fields, endpoints, error codes)
keep `v1`; a breaking change would get `/api/v2` side by side.

**Tenancy.** Tenant-scoped calls send `X-Organization-Id`, checked against the caller's memberships
(`403 tenant.forbidden`). The organization is a header, not a JWT claim: switching organizations needs no new
token, and a revoked membership takes effect on the next request instead of when the token expires. Ids from
another tenant return `404`, never `403`, so existence doesn't leak.

**Errors: RFC 9457 Problem Details** (`application/problem+json`) with three extensions:

| Field           | Purpose                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `code`          | Stable machine-readable code (`members.last_admin`); clients translate by it                |
| `correlationId` | Same id as the `X-Correlation-Id` response header and the server logs                       |
| `errors[]`      | `{field, code, message, params?}` per field; `code` is field-agnostic (`required`, `length`...) |

`type` is `urn:kora:problem:<code>`: a real URI that points at the code without implying a documentation site
we don't host. `detail` is for developers. A 5xx never contains internal messages. Rejected values are never
echoed (they may be passwords). Codes live in `*ErrorCodes` classes; the contract's `ErrorCode` enum lists them
all, and a test enforces it.

**Paging.** `page` (0-based), `size` (default 20, capped at 100), `sort=field,dir` repeatable. Response
`{content, page, size, totalElements, totalPages}`. Sort fields are an explicit allow-list per endpoint that maps
API names to entity properties (`SortPolicy`); unknown fields are a `400`. Feeds (notifications, activity,
audit) use cursors: `{content, nextCursor}`.

**Optimistic locking.** Versioned resources return `ETag: "<version>"` and a `version` field. Updates must send
`If-Match`: missing or malformed → `428 concurrency.if_match_required`; stale → `412 concurrency.stale_version`.
JPA's `@Version` catches the remaining race between the check and the write, mapped to the same `412`.

**Correlation ids.** Accepted from the client when they match `[A-Za-z0-9-]{1,64}`, otherwise generated.
Echoed on every response, put in the logging context, returned in every problem.

**Formats.** JSON with absent optional fields omitted, not `null`. Instants in ISO 8601 UTC, dates as ISO
dates, money as decimal strings with an ISO 4217 currency (Phase 3), ids as UUIDs.

## Alternatives considered

- **Spring's default error JSON (`timestamp`, `error`, `path`)** — no machine-readable code and no field list;
  every client ends up parsing English messages.
- **Organization id in the JWT** — one token per organization, and stale permissions until the token expires.
- **Offset/limit paging everywhere** — fine for tables, wrong for append-heavy feeds where new rows shift the
  offsets; hence cursors for feeds.
- **Last-write-wins updates** — silently loses concurrent edits to shared records (organization settings, roles).
- **Passing `sort` straight to Spring Data** — lets clients sort by any property path, including hidden ones.

## Consequences

- One error mapping, one paging component and one retry rule in the web client serve every feature.
- Adding a module means reusing `platform` (`ProblemException` subclasses, `SortPolicy`, `@IfMatchVersion`,
  `PageResponse`) rather than writing plumbing.
- Every new error code is a contract change and has to be added to the `ErrorCode` enum.
