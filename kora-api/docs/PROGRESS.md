# kora-api — progress

## Current status

Phase 1 complete (tag `api-v0.1.0`). Waiting for "continue".

Contract 0.1.0 is in `docs/openapi.yaml` and announced to the web session. The whole build, including the
Testcontainers integration tests, passes locally with Docker Desktop.

## Next step

Phase 2 — identity and tenancy (features 01–03, 23): users and Argon2id passwords, JWT access tokens with key
rotation, refresh-token rotation with reuse detection in Redis, rate limiting, register-organization, tenant
resolution with a repository filter and PostgreSQL row-level security, members, invitations, `/me`, email via
Mailpit, and response validation against the contract.

## Checklist

- [x] 0. Scaffold, Maven wrapper, quality gates (Spotless, Checkstyle, ArchUnit, Modulith, JaCoCo), Testcontainers, CI (GitHub + GitLab), docs
- [x] 1. Contract 0.1.0, Problem Details, correlation ids, pagination, optimistic locking, logging, contract lint
- [ ] 2. Identity & tenancy: users, JWT + refresh rotation, rate limits, organizations, RLS, members, invitations, `/me` (features 01–03, 23)
- [ ] 3. Portfolios, programs, projects, charter, WBS, dashboard read model (04–07)
- [ ] 4. Tasks, board, lexorank, backlog, sprints, burndown, velocity (08–09)
- [ ] 5. Dependencies, critical path, baselines, working calendar (10)
- [ ] 6. Risks, issues, stakeholders, change requests with approval chain (11–14)
- [ ] 7. Timesheets, capacity, EVM (15–17)
- [ ] 8. Outbox, notifications, WebSocket, audit trail, attachments (18–20)
- [ ] 9. Report exports, demo data (21–22)
- [ ] 10. Tracing, performance, Docker image, full-stack compose, final README; tag v1.0.0

## Decisions so far

- ADR 0001 — record decisions as ADRs
- ADR 0002 — one repository, two parallel sessions, commits on `main`, tags per phase
- ADR 0003 — toolchain baseline (Java 25, Spring Boot 4.1, Modulith 2.1, Maven, Testcontainers, quality gates)
- ADR 0004 — modular monolith with pragmatic hexagonal modules
- ADR 0005 — REST API conventions (errors, tenancy header, paging, If-Match, correlation ids)
- ADR 0006 — contract-first with a hand-written OpenAPI 3.0.3 document, linted and enforced by tests
