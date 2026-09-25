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
