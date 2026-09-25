# kora-api — progress

## Current status

Phase 0 complete (tag `api-v0.0.1`). Waiting for "continue".

Integration tests (`*IT`) were skipped locally because Docker is not installed yet; they run in CI and will
run locally once Docker Desktop is available.

## Next step

Phase 1 — contract 0.1.0 and platform conventions: `docs/openapi.yaml` (auth, organization, me, members,
invitations) with the shapes agreed with the web session, RFC 9457 Problem Details with stable codes,
correlation ids, pagination, ETag / If-Match, structured JSON logging, and a contract-conformance test.

## Checklist

- [x] 0. Scaffold, Maven wrapper, quality gates (Spotless, Checkstyle, ArchUnit, Modulith, JaCoCo), Testcontainers, CI (GitHub + GitLab), docs
- [ ] 1. Contract 0.1.0, Problem Details, correlation ids, pagination, optimistic locking, logging
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
