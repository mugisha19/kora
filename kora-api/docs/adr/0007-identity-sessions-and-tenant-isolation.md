# 0007 — Identity, sessions and tenant isolation

- Status: Accepted
- Date: 2026-09-26

## Context

Features 01–03 need people to sign in safely from a browser single-page app, stay signed in across reloads, and
belong to several organizations that must never see each other's data. These decisions are the security core
every later module builds on.

## Decision

### Sessions: short access token + rotating refresh token

- **Access token:** JWT, ES256, 15 minutes, claims `sub`, `iat`, `exp`, `jti`, `iss` and a `kid` header. It
  lives only in the web app's memory. It carries no roles and no organization, so a role change or a removed
  membership applies on the next request.
- **Refresh token:** 256 random bits, only its SHA-256 stored (Redis), sent only in the `kora_refresh` cookie
  (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`). Its lifetime is 14 days idle and 30 days absolute.
- **Rotation with reuse detection:** every refresh returns a new token and marks the old one with an atomic
  `HSETNX`. Presenting an exchanged token means it was copied, so the whole *family* (that sign-in) is revoked.
  Exception: within a 10-second grace period it is treated as two tabs refreshing at once and just rejected, and
  the client retries once with the cookie the winning tab received.
- **Key rotation:** the signing key and `kid` come from configuration. Retired public keys stay in
  `previous-keys` until their tokens have expired. Ephemeral keys are allowed only outside the `prod` profile.
- **Signing out** revokes the family. A password reset revokes all of the user's families. Access tokens
  already issued remain valid for up to 15 minutes, the accepted price of stateless verification.

### Credentials

- Argon2id (19 MiB, 2 iterations), behind a `PasswordHasher` strategy.
- NIST-style policy: 12–128 characters and not on a breached list (bundled list; replaceable port).
- Login failures are identical for an unknown email and a wrong password: same code, same message, and exactly
  one hash comparison in both cases (a dummy hash for unknown emails).
- Rate limits are token buckets in Redis (Bucket4j) per IP and per email, with keys hashed (emails are personal
  data). A 429 carries `Retry-After`.
- Password reset: always `202`. The email is sent asynchronously after commit so timing doesn't reveal accounts.
  Tokens are single-use, expire in 30 minutes and are stored hashed.

### Tenant isolation, three layers that each fail closed

1. **Request:** `TenantFilter` checks `X-Organization-Id` against the caller's memberships (`403 tenant.forbidden`,
   identical for "not yours" and "doesn't exist") and binds `TenantScope` and `CurrentMember` for the request.
   Both are `ScopedValue`s (Java 25), so bindings can't leak across pooled or virtual threads.
2. **ORM:** Hibernate `@TenantId` on every tenant-owned entity (enforced by ArchUnit) adds the organization to
   every query and insert. With no scope bound, the resolver returns an id no organization has.
3. **Database:** PostgreSQL row-level security on every tenant table. Each JPA transaction starts with
   `SET LOCAL ROLE kora_app` (a role that owns nothing, so it can't bypass RLS) and
   `set_config('app.org', <scope>, true)`. Both are transaction-local and reset at commit, so pooled connections
   stay clean. A native query that "forgot" the tenant sees nothing; a write into another tenant is refused.
- **Other tenants' ids return 404**, never 403.
- **System scope** (all tenants) must be requested explicitly (`TenantTransactions.inSystem`). It is used only for
  sign-in membership lookups, invitation links, profile copies and scheduled jobs.
- **Scope before transaction:** PostgreSQL reads the scope when a transaction begins. `TenantTransactions` binds
  the scope and starts a new transaction in one call, so the order can't be wrong.

### Authorization

Role checks are explicit calls at the start of each use case (`CurrentMember.requireRole(ORG_ADMIN)`), before
anything is loaded, rather than `@PreAuthorize` SpEL expressions. They are plain Java, visible where the rule
lives, and covered by a role × endpoint test matrix.

## Alternatives considered

- **Access and refresh tokens both in `localStorage`** — any XSS steals a long-lived credential.
- **Server-side sessions (Spring Session)** — simpler revocation, but sticky or shared session state for every
  request, and the spec asks for stateless JWT access.
- **Organization id as a JWT claim** — one token per organization, and stale permissions until expiry.
- **Only a repository-level tenant filter** — one forgotten filter, one native query or one new repository leaks
  data. RLS makes the database itself refuse.
- **`ThreadLocal` for the tenant** — easy to leak across requests on reused threads; `ScopedValue` ends with the
  call by construction.
- **Have I Been Pwned API for breached passwords** — better coverage, but a network dependency on every password
  change. Deferred behind the same port.

## Consequences

- Every transactional read of tenant data costs two extra statements (`SET LOCAL ROLE`, `set_config`); negligible
  next to the protection.
- Tenant data must be accessed through JPA transactions. Plain JDBC connects as the owner and bypasses RLS, so it
  is reserved for migrations and test setup.
- New tenant-owned tables need `organization_id`, `@TenantId` and an RLS policy (see `V3__organization.sql`).
