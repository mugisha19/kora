# Kora API

Spring Boot back end for **Kora**, a multi-tenant project and portfolio management platform built on PMI practices
(Agile, Predictive and Hybrid). It covers portfolios, charters and WBS; tasks, boards and sprints; schedules with the
critical path; risks, issues, stakeholders and change control; timesheets, capacity and earned value;
notifications, an audit trail and attachments; and PDF and Excel reports, in English, French and Kinyarwanda.

## Tech

Java 25 · Spring Boot 4.1 · Spring Modulith (a modular monolith of hexagonal modules) · PostgreSQL 18 with Flyway and
row-level security · Redis · S3-compatible storage · OpenTelemetry · Testcontainers · ArchUnit · JaCoCo · Spotless and
Checkstyle · GitHub Actions and GitLab CI, with Trivy image scans

## Try it with Docker only

```bash
cd kora-api
docker compose --profile demo up --build
```

This builds the API image and starts it with PostgreSQL, Redis, SeaweedFS (S3) and Mailpit.
- The API is on http://localhost:8080 and creates the demo organizations on first start. Wait for `Demo data ready`
  in the log, about a minute.
- Sign in with the password `KoraDemo!2026` as:
  - `admin@kora.demo` (ORG_ADMIN, and PMO in the second organization);
  - `pmo@kora.demo`, `pm@kora.demo`, `member@kora.demo` or `viewer@kora.demo`.
- Emails arrive in Mailpit at http://localhost:8025.

All names, companies and figures are fictional.

## Develop

Requires JDK 25 and Docker. The development services come from `compose.yaml`, and the integration tests use
Testcontainers. Maven comes with the wrapper.

```bash
cd kora-api
./mvnw spring-boot:run                                   # services from compose.yaml, then the API on :8080
./mvnw spring-boot:run -Dspring-boot.run.profiles=demo   # the same, with the demo organizations
./mvnw test              # fast unit, architecture and contract tests
./mvnw verify            # everything CI runs: format, static checks, unit and integration tests, coverage
./mvnw spotless:apply    # fix formatting
```

Without Docker, `./mvnw verify` runs everything except the integration tests, which are reported as skipped. In CI
they fail instead, so a broken runner can't pass.

- Locally: health on `/actuator/health`, build info on `/actuator/info`, metrics on `/actuator/prometheus`.
- In the container image and the `prod` profile, the actuator listens on port 8081 only, which isn't published.

## Configuration

Settings are Spring Boot properties, set through environment variables. The `prod` profile has no development
defaults: it refuses to start without its signing key and storage settings.

| Setting | Environment variables |
| --- | --- |
| Database | `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` |
| Redis (rate limits, refresh tokens) | `SPRING_DATA_REDIS_HOST`, `SPRING_DATA_REDIS_PORT` |
| Mail | `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `KORA_MAIL_FROM` |
| Links in emails, CORS for uploads | `KORA_WEB_BASE_URL` |
| Attachments and reports (S3 or compatible) | `KORA_STORAGE_ENDPOINT`, `KORA_STORAGE_PUBLIC_ENDPOINT`, `KORA_STORAGE_REGION`, `KORA_STORAGE_BUCKET`, `KORA_STORAGE_ACCESS_KEY`, `KORA_STORAGE_SECRET_KEY` |
| Trace export | `MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT` (e.g. `http://otel-collector:4318/v1/traces`), `KORA_TRACING_SAMPLING` (default `0.1`) |
| Profiles | `SPRING_PROFILES_ACTIVE`: `prod` for JSON logs and no development defaults, `demo` for the demo data. Never both. |

### Signing keys

Locally, the API generates a throw-away signing key at start-up, so sessions end on restart. Anywhere else, create an
EC P-256 key pair and pass it through environment variables:

```bash
openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out jwt-private.pem
openssl ec -in jwt-private.pem -pubout -out jwt-public.pem
export KORA_IDENTITY_JWT_KEY_ID=key-2026-09
export KORA_IDENTITY_JWT_PRIVATE_KEY="$(cat jwt-private.pem)"
export KORA_IDENTITY_JWT_PUBLIC_KEY="$(cat jwt-public.pem)"
```

To rotate, deploy a new pair and list the old public key under `kora.identity.jwt.previous-keys` until the last tokens
it signed have expired (15 minutes). See ADR 0007.

## Operating it

- **Following a request.** Every request has one id: the client's `X-Correlation-Id`, or else its trace id. It is in
  every log line (with `organizationId` and `userId`), in the audit trail, in error responses and in the trace.
- **Metrics.**
  - Prometheus scrapes port 8081.
  - Business counters: `kora_sign_ins_total`, `kora_approval_decisions_total` and the report generation timer
    `kora_reports_generation_seconds`.
  - The usual JVM, HTTP, database pool and outbox metrics.
- **Background work** goes through a transactional outbox: notifications, report generation and emails. Undelivered
  events are redelivered at startup and failed deliveries retried every few minutes (ADR 0013, ADR 0014).
- **Probes:** `/actuator/health/liveness` and `/actuator/health/readiness`.

## Documentation

- [API contract (OpenAPI 3.0)](docs/openapi.yaml) · [contract change log](docs/contract-requests.md)
- [Architecture decisions](docs/adr/) (15 ADRs, from the repository layout to observability)
- [Progress by phase](docs/PROGRESS.md) · [design patterns](docs/PATTERNS.md) · [learning notes](docs/LEARNING.md)
- Module diagrams: generated by `./mvnw test` into `target/spring-modulith-docs`
