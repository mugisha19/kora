# kora-api — progress

## Current status

Phase 10 complete (tag `api-v1.0.0`): the API is feature-complete for features 01–24.

Phase 10 added:
- **Tracing:** OpenTelemetry, with the trace id as the default correlation id.
- **Logs and metrics:** organization and user ids in every log line; business metrics.
- **Performance:** a test that keeps 17 list endpoints free of N+1 queries (and removed count queries from cursor
  pages).
- **Delivery:**
  - a layered, non-root container image with the actuator off the public port;
  - `docker compose --profile demo up --build` for a populated stack;
  - image scans in CI, whose first run found and fixed critical Tomcat vulnerabilities.

263 unit and 854 integration tests, 94.4% line coverage.

## Next step

The product release `v1.0.0` follows the web app's Phase 10. That phase adds the Nginx image and `kora-web/compose.yaml`;
a root `compose.yaml` will then include both apps' compose files (agreed with the web session). Who tags `v1.0.0` is
the user's decision.

## Checklist

- [x] 0. Scaffold, Maven wrapper, quality gates (Spotless, Checkstyle, ArchUnit, Modulith, JaCoCo), Testcontainers, CI (GitHub + GitLab), docs
- [x] 1. Contract 0.1.0, Problem Details, correlation ids, pagination, optimistic locking, logging, contract lint
- [x] 2. Identity & tenancy: users, JWT + refresh rotation, rate limits, organizations, RLS, members, invitations, `/me` (features 01–03, 23)
- [x] 3. Portfolios, programs, projects, charter, WBS, dashboard read model (04–07)
- [x] 4. Tasks, board, lexorank, backlog, sprints, burndown, velocity (08–09)
- [x] 5. Dependencies, critical path, baselines, working calendar (10)
- [x] 6. Risks, issues, stakeholders, change requests with approval chain (11–14)
- [x] 7. Timesheets, capacity, EVM (15–17)
- [x] 8. Outbox, notifications, WebSocket, audit trail, attachments (18–20)
- [x] 9. Report exports, demo data (21–22)
- [x] 10. Tracing, performance, Docker image, full-stack compose, final README; tag api-v1.0.0 (product v1.0.0 after web Phase 10)

## Decisions so far

- ADR 0001 — record decisions as ADRs
- ADR 0002 — one repository, two parallel sessions, commits on `main`, tags per phase
- ADR 0003 — toolchain baseline (Java 25, Spring Boot 4.1, Modulith 2.1, Maven, Testcontainers, quality gates)
- ADR 0004 — modular monolith with pragmatic hexagonal modules
- ADR 0005 — REST API conventions (errors, tenancy header, paging, If-Match, correlation ids)
- ADR 0006 — contract-first with a hand-written OpenAPI 3.0.3 document, linted and enforced by tests
- ADR 0007 — sessions (JWT + rotating refresh families), credentials, three-layer tenant isolation, explicit role checks
- ADR 0008 — project access policy, charter versions, WBS as a Composite, money, synchronous dashboard read model
- ADR 0009 — work module: task lifecycle, lexorank, WIP limits, sprints, burndown snapshots, task-based WBS progress
- ADR 0010 — schedule module: CPM as a Strategy on working-day numbers, computed on read, baselines, org calendar
- ADR 0011 — governance module: registers, health from overdue critical risks, approval Chain of Responsibility,
  atomic application of approved changes
- ADR 0012 — per-project timesheets, dated cost rates, capacity, EVM strategies and snapshots, SPI/CPI in health
- ADR 0013 — transactional outbox, persistence-level hash-chained audit trail, notifications and STOMP, presigned
  attachments with content sniffing, SeaweedFS for local S3
- ADR 0014: report exports (a reports module with data-owning ReportSources, Template Method exporters,
  background jobs), demo data seeded through the public API, outbox redelivery
- ADR 0015: OpenTelemetry tracing and trace-id correlation, business metrics, query-count tests, the container
  image, the compose demo stack and image scanning
