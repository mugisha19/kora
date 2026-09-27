# kora-api — conventions for future sessions

Read this file and `docs/PROGRESS.md` before doing anything. Requirements live in `../kora-features/*.md`
(outside the repository): read the feature file(s) for a phase before starting it.

## Scope

- Work only in `kora-api/` (plus `.github/workflows/api-ci.yml`). Never edit `kora-web/`.
- A separate session builds `kora-web/` in parallel. The contract `docs/openapi.yaml` is the only interface:
  announce every contract change to the "Frontend work" session (SendMessage) so it regenerates its client.
  Its requests for changes go in `docs/contract-requests.md`.

## Stack

Java 25, Spring Boot 4.1 (Spring Framework 7, Hibernate 7, Jackson 3), Spring Modulith 2.1, Maven wrapper,
PostgreSQL 18 + Flyway, Redis, Testcontainers, ArchUnit, JaCoCo, Spotless (Palantir Java Format), Checkstyle.
See ADR 0003.

## Structure

`com.kora.<module>` = one Spring Modulith module per business capability (module map in ADR 0004), each split
into `domain` → `application` → `adapter.{web,persistence,...}`; dependencies point inwards only.

## Rules

- API conventions: base `/api/v1`, `X-Organization-Id` tenant header, RFC 9457 Problem Details with `code`,
  `correlationId`, `errors[]`; paged lists `{content,page,size,totalElements,totalPages}` (0-based);
  `version` + ETag, `If-Match` required on updates (412 stale, 428 missing).
- Tenancy (ADR 0007): every tenant-owned table has `organization_id NOT NULL`, an RLS policy (copy
  `V3__organization.sql`) and `@TenantId` on the entity field; a cross-tenant id returns 404. Bind a scope and start
  a transaction together with `TenantTransactions`, never the other way round; system scope only when a flow truly
  crosses organizations. Tenant data only through JPA (plain JDBC bypasses RLS).
- Authorization: the first line of a use case is `CurrentMember.requireRole(...)`, before any lookup. Add every new
  endpoint to `RoleMatrixIT`, and check every integration-test response with `Contract.conforms(...)`.
- Money is `platform.money.Money` (BigDecimal in minor units, half-even), JSON amounts are strings, and every amount
  is in the organization's currency (modules holding amounts implement `CurrencyUsage`). Time is `java.time`:
  `Instant` for moments, and "today" in the organization's time zone (`OrganizationTimeZone`), never UTC.
- Project-scoped data goes through `ProjectAccess` (`readable`/`participating`/`manageable`); changes that affect
  the dashboard publish `ProjectChanged`, `WbsChanged` or `TaskChanged` inside the transaction.
- Invalid input is `400 validation.failed` with `errors[].field` naming the request field (never 422).
- Counts of days in plans (durations, lags, float, variance) are working days on the organization's calendar
  (`schedule` module); derived views such as the schedule are computed on read unless an ADR says otherwise.
- Integration tests use `@IntegrationTest` and are named `*IT`; never H2.
- Comments explain WHY. Record decisions in `docs/adr/`, patterns in `docs/PATTERNS.md`, interview
  explanations in `docs/LEARNING.md`.
- Check the latest stable version of a dependency before adding it.

## Commands (run in `kora-api/`)

`./mvnw spring-boot:run` (needs Docker; starts `compose.yaml`) · `./mvnw test` (fast) ·
`./mvnw spotless:apply` · `./mvnw verify` (everything CI runs; must be green before every commit)

## Git (ADR 0002)

- Commit directly on `main`. Never checkout/switch branches, rebase, reset, stash or force-push: the web
  session shares this working tree.
- Always commit with explicit paths: `git add <files> && git commit -m "…" -- <files>`. Never `git add .`/`-A`
  and never a bare `git commit` (the index is shared). On `.git/index.lock`, wait and retry; never delete it.
- One file (or one tightly coupled group) per commit. Conventional Commits with scope `api[/area]`,
  e.g. `feat(api/identity): add refresh token rotation`.
- Tag each finished phase `api-v0.N.0` (annotated). Stop after every phase and wait for "continue".
