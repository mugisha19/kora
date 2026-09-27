# kora-api — progress

## Current status

Phase 9 complete (tag `api-v0.9.0`). Waiting for "continue".

Contract 0.8.0 is implemented:
- **Report exports:** project status, portfolio summary, risk register, EVM and timesheets, as PDF and Excel.
  - Generated in the background as the requester, in their language, and stored for 7 days.
  - Announced by a notification.
  - Excel text that looks like a formula is kept as text.
  - Sheets are streamed, so size doesn't matter.
- **Demo profile:** seeds two fictional organizations through the public API, with history in every module and demo
  logins for every role.
- **Outbox:** events are now redelivered after a restart and retried when a listener fails.

263 unit and 835 integration tests, 94.1% line coverage.

## Next step

Phase 10: tracing, performance, the Docker image, full-stack compose (with `--profile demo`) and the final README.
Tag v1.0.0.

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
- [ ] 10. Tracing, performance, Docker image, full-stack compose, final README; tag v1.0.0

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
