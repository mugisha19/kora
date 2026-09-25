# Learning notes — kora-api

Plain-language explanations of the ideas behind this codebase, written so you can explain them in an
interview. Each phase adds sections.

## Modular monolith (Phase 0)

One application, one deployment, one database, but split into **modules** that each own a business
capability (identity, portfolio, work, governance...). A module exposes a small public API and keeps
everything else internal. Spring Modulith treats each package under `com.kora` as a module and a test
(`ModularityTests`) fails when one module reaches into another's internals or when two modules depend on each
other in a cycle.
**Why it matters:** you get most of the design benefits of microservices (clear ownership, independent
reasoning) without the network, distributed transactions and operational weight.
**Interview line:** "Start with a modular monolith; split out a service only when a module needs to scale
or deploy independently, and the module boundary is already the service boundary."

## Hexagonal architecture (Phase 0)

Also called ports and adapters. The **domain** (business rules) sits in the middle and knows nothing about
HTTP, databases or email. The **application** layer runs use cases and defines **ports**: interfaces for
what it needs from the outside ("save a project", "send an email"). **Adapters** implement those ports
(JPA repository, SMTP sender) or drive the application (REST controller). Dependencies only point inwards.
**Why it matters:** business rules can be unit-tested without Spring or a database, and swapping MinIO for
AWS S3 means writing one adapter.
**Our pragmatic choice:** entities keep their JPA annotations instead of having a separate persistence
model (ADR 0004). An ArchUnit test enforces the direction of dependencies.

## Testcontainers instead of H2 (Phase 0)

Integration tests start a real PostgreSQL 18 in Docker and throw it away afterwards. `@ServiceConnection`
tells Spring Boot the container's URL and password, so tests never hard-code them.
**Why not H2?** It's a different database. Row-level security, `ltree`, JSONB and partitioning don't exist
there, so a test passing on H2 says little about production.
**Detail worth mentioning:** every integration test uses the same `@IntegrationTest` annotation, so Spring
caches one application context and the container starts once per run, not once per class.

## Flyway owns the schema (Phase 0)

Schema changes are versioned SQL files (`V1__...sql`) applied in order and recorded in a history table.
Hibernate is set to `ddl-auto: validate`: it checks that entities match the tables but never changes them.
**Why:** the schema is reviewed like code, every environment gets exactly the same migrations, and nothing
changes the production schema by accident at start-up.

## Quality gates in one command (Phase 0)

`./mvnw verify` runs, in Maven lifecycle order: formatting check (Spotless), static rules (Checkstyle),
compile, unit tests and architecture tests (Surefire), integration tests (Failsafe), then the coverage gate
(JaCoCo). CI runs exactly the same command, so "works on my machine" and "passes CI" mean the same thing.
**Unit vs integration split:** `*Test` classes are fast and need nothing; `*IT` classes start Spring and
PostgreSQL. You can run `./mvnw test` for quick feedback and `./mvnw verify` before committing.

## Virtual threads (Phase 0)

Java 21+ can run each request on a **virtual thread**: a cheap thread managed by the JVM that releases its
carrier thread while it waits on I/O (a database query, an HTTP call). With one property
(`spring.threads.virtual.enabled`) the classic blocking Spring MVC style scales to many concurrent requests
without switching to reactive programming.

## Problem Details and stable error codes (Phase 1)

RFC 9457 defines one JSON shape for HTTP errors: `type`, `title`, `status`, `detail`, `instance`, plus your own
fields. We add `code` (e.g. `members.last_admin`), `correlationId` and `errors[]`. The client never parses the
English `detail`; it looks up `code` in its translation files (English, French, Kinyarwanda). That's what makes
error messages translatable and lets the API reword a message without breaking any screen.
**Interview line:** "Errors are part of the contract: a stable code for machines, a message for humans, and a
correlation id to find the server log."

## 404 vs 403 across tenants (Phase 1)

If user A asks for a project that belongs to another organization, answering `403 Forbidden` tells A the id
exists. Answering `404 Not Found` reveals nothing. So `403` is used only when the caller may know the resource
exists but lacks the role (`access.denied`) or isn't a member of the organization they named in the header.

## Optimistic locking with ETag and If-Match (Phase 1)

Two admins open the organization settings. Both edit and save. Without protection, the second save silently
overwrites the first (a *lost update*). With optimistic locking, every read returns the version (`ETag: "3"`) and
every update must send it back (`If-Match: "3"`). If someone saved in between, the version is now 4 and the API
answers `412 Precondition Failed`; the UI says "someone else saved first" and reloads. It's "optimistic" because
nothing is locked while people edit; conflicts are rare and detected at save time. `428` means the client forgot
`If-Match` altogether, which would otherwise be a silent last-write-wins.

## Correlation ids (Phase 1)

Every request gets an id (the client may supply one). It's in the response header, in every log line of that
request (via SLF4J's MDC) and in every error body. When a user reports an error, the id in the toast leads
straight to the exact server logs. We only accept short ids of safe characters: anything else could inject fake
lines into logs or extra headers into responses.

## Contract-first (Phase 1)

The OpenAPI file was written before any endpoint, agreed with the front end, and is now the source of truth.
The web app generates its client and mocks from it; the API is tested against it. Tests also lint the contract
itself, so conventions (error format, headers, tenant scoping) can't be forgotten on a new endpoint.
**Why not generate the spec from code?** Then the contract only exists after the code, and renaming a Java field
would silently break the client. See ADR 0006.
