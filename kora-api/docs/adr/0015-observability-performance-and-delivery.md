# 0015 — Observability, performance checks and delivery

- Status: Accepted
- Date: 2026-09-28

## Context

Phase 10 finishes the API (feature 24): tracing and business metrics, proof that list endpoints don't degrade with
data, a container image, a runnable stack, and CI that checks the image as well as the code.

## Decision

### Observability

- **Tracing with OpenTelemetry.**
  - `spring-boot-starter-opentelemetry` bridges Micrometer Observations to OpenTelemetry. Every HTTP request gets a
    trace that continues a W3C `traceparent` from the caller.
  - Spans are exported over OTLP once `MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT` points at a collector.
    Without it, nothing is exported. 10% of requests are sampled (`KORA_TRACING_SAMPLING`).
  - The OTLP *metrics* exporter is off, because Prometheus scrapes `/actuator/prometheus`.
- **One id for everything.** Without an `X-Correlation-Id` from the client, the correlation id is the request's trace
  id. The filter now runs right after the observation filter, so a log line, an audit entry, an error response and
  a trace all share one id.
- **Log context.** Every log line of a request carries `correlationId`, `organizationId` and `userId`: ids only, no
  names or emails. In production they are fields of the ECS JSON log.
- **Business metrics** (`platform.metrics.BusinessMetrics`), low-cardinality counters:
  - `kora_sign_ins_total{outcome}`;
  - `kora_approval_decisions_total{subject, decision}`, for change requests and timesheets;
  - `kora_reports_generation_seconds{type, format, outcome}` (Phase 9).
- **Actuator locked down.** In the `prod` profile, and always in the container image, the actuator listens on port
  8081, which is not published. The public port serves only the API.

### Performance

- **No N+1, as a test.** `QueryCountIT` builds two organizations of the same shape, one with 2 items of each kind
  and one with 12. It reads 17 list endpoints in both and asserts the larger one runs no more SQL statements, using
  Hibernate statistics and the fewest of three reads so a background listener can't add noise.
  - It found a pattern, not a per-row query: cursor-paged lists (the audit log, the activity feed, notifications)
    asked Spring Data for a `Page`, which counts all matching rows whenever a page is full. On the audit table, that
    count would be the most expensive query of the request.
  - Both now use `findBy(spec, q -> q.sortBy(..).limit(n).all())`: rows only, no count.
- **No Redis cache of read models.** The dashboard reads a precomputed table (ADR 0008), and every list runs a
  constant, small number of indexed queries. A cache would add invalidation across tenants for no measured gain;
  Redis stays for rate limits and refresh tokens.

### Delivery

- **Image** (`kora-api/Dockerfile`, multi-stage):
  - The JDK stage packages with the wrapper (tests run in CI, not in the image build) and splits the jar into Spring
    Boot layers.
  - The runtime stage is `eclipse-temurin:25-jre-alpine`, running as a non-root user.
  - Layers are copied from least to most often changed, so a code change rebuilds only the last one.
  - `MaxRAMPercentage=75` and exit on out-of-memory, so the orchestrator restarts a broken JVM.
  - A health check on the readiness probe.
- **Compose** (`kora-api/compose.yaml`):
  - The development services are unchanged.
  - An `api` service, under the `demo` profile, builds the image and runs it with the demo data:
    `docker compose --profile demo up --build`.
  - The web app's Nginx proxies to this service by its name, `api`. A root `compose.yaml` will `include` both apps'
    compose files once the web image exists (agreed with the web session; shared root file).
- **CI.** Both GitHub Actions and GitLab build the image after the tests pass and scan it with Trivy, run from its
  pinned container image rather than a third-party action. The build fails on critical vulnerabilities that have a
  fix, in the JRE, the OS packages or any library.

## Consequences

- **Following one request:** its id is in every log line, the audit trail and, when exported, the trace backend.
- **Performance regressions:** a new list endpoint with a per-row lookup fails `QueryCountIT` once added to its list.
- **The first scan caught something.** It found three critical vulnerabilities in Tomcat 11.0.24, the version Spring
  Boot 4.1.1 manages. `tomcat.version` pins 11.0.26 until Boot catches up. A test suite, however complete, can't
  catch this; the image scan is what makes CI a gate on what ships, not just on what was written.
- **Images:** they are built and scanned, not published. Pushing to a registry is a deployment decision left open.
