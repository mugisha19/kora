# 0003 — Back-end toolchain baseline

- Status: Accepted
- Date: 2026-09-25

## Context

The toolchain decides how fast feedback is and how strict the codebase stays as it grows. Versions were
checked on 2026-09-25 against Spring Initializr and Maven Central rather than taken from memory.

## Decision

| Concern            | Choice                                                             | Version       |
| ------------------ | ------------------------------------------------------------------ | ------------- |
| Language / runtime | Java (LTS)                                                         | 25            |
| Framework          | Spring Boot (Spring Framework 7, Hibernate 7, Jackson 3)           | 4.1.1         |
| Modularity         | Spring Modulith                                                    | 2.1.1         |
| Build              | Maven via the Maven Wrapper (`./mvnw`, script-only)                | 3.9.16        |
| Database           | PostgreSQL, schema owned by Flyway; Hibernate only validates       | 18            |
| Integration tests  | Testcontainers with `@ServiceConnection`, run by Failsafe (`*IT`)  | 2.0 (Boot)    |
| Architecture tests | ArchUnit (layering) + Spring Modulith `verify()` (module borders)  | 1.5.1         |
| Formatting         | Spotless + Palantir Java Format                                    | 3.10.2/2.99.0 |
| Static rules       | Checkstyle, focused ruleset in `config/checkstyle/checkstyle.xml`  | 14.1.0        |
| Coverage           | JaCoCo, unit + integration, gate ≥ 80 % lines on domain/application | 0.8.15       |
| Observability      | Actuator (health probes, info, Prometheus)                         | Boot-managed  |

Notable points:

- **Java 25, not the 21 in the original plan.** 25 is the current LTS and the JDK installed for development;
  Spring Boot 4 supports it fully. The build enforces JDK 25+.
- **Palantir Java Format** is Google Java Style with 4-space indentation and 120 columns, which matches the
  shared `.editorconfig` (4 spaces for Java) and wraps Spring's long builder chains more readably than
  google-java-format's 100 columns.
- **Checkstyle doesn't check layout.** The formatter owns whitespace, so the two tools never disagree;
  Checkstyle catches naming, star imports, empty catches, old date APIs and `System.out`.
- **Real PostgreSQL in tests, never H2.** Row-level security, `ltree`, `citext`, JSONB and partitioning
  (features 02, 07, 19) don't exist in H2. A test on a different database proves little.
- **Integration tests skip locally without Docker but fail in CI** (`RequiresDockerCondition`), so a
  broken CI Docker daemon can't produce a green build.
- **Virtual threads on** (`spring.threads.virtual.enabled`): blocking JDBC in request handling stops
  pinning platform threads, with no reactive rewrite.
- **Mockito runs as a Java agent** in Surefire/Failsafe, as the JDK now warns about (and will block) agents
  that attach themselves at runtime.

## Alternatives considered

- **Gradle** — faster incremental builds, but the Maven lifecycle (validate → test → verify) maps directly
  onto the quality gates, and it is what most Spring reviewers expect to read.
- **H2 for tests** — faster start, but a different SQL dialect with none of the PostgreSQL features we rely on.
- **google-java-format** — 2-space indentation conflicts with `.editorconfig`; the AOSP variant keeps the
  100-column limit.
- **Checkstyle's `google_checks.xml`** — duplicates and contradicts what the formatter already enforces.

## Consequences

- `./mvnw verify` is the single command that CI and developers run; it fails on formatting, static rules,
  architecture, tests and coverage.
- Docker is required to run the integration tests locally.
- The container image (multi-stage Dockerfile) is deferred to Phase 10, like the web's Nginx image.
