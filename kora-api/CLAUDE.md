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
- Every tenant-owned table has `organization_id NOT NULL`; a cross-tenant id returns 404.
- Money is `BigDecimal` with explicit rounding, never `double`. Time is `java.time` (`Instant` for moments).
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
