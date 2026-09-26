# Design patterns in kora-api

Patterns are used only where they solve a real problem. Each row gets file paths when the pattern actually
lands in code; a pattern that doesn't earn its place is rejected in an ADR.

| Pattern                        | Problem it solves in Kora                                                                 | Status             | Where |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ | ----- |
| Ports and adapters (Adapter)   | Email, token store, file storage, clock behind interfaces; in-memory fakes in tests        | Done — Phase 2     | `platform/mail/EmailSender`, `identity/application/RefreshTokenStore` + `adapter/redis`, `*Repository` ports + `adapter/persistence` |
| Strategy                       | Password hashing; CPM scheduling; EAC and percent-complete methods; methodology rules     | Hashing done — 2; 5, 7 planned | `identity/application/PasswordHasher`, `identity/adapter/security/Argon2PasswordHasher` |
| State                          | Lifecycles where illegal moves must be impossible: invitation, project, charter, task, issue, change request | Invitation, project, charter done — 2–3; 4–6 planned | `organization/domain/InvitationStatus`, `portfolio/domain/ProjectStatus`, `portfolio/domain/CharterStatus` |
| Specification                  | Composable, tenant-safe filters for list endpoints (members, projects, tasks, risks)      | Done — Phases 2–3  | `MemberSpecifications`, `portfolio/adapter/persistence/PortfolioSpecifications` (incl. project visibility) |
| Builder                        | Readable test fixtures and the demo data seeder                                           | Planned — Phase 2  | —     |
| Composite                      | WBS roll-up: a work package and a whole subtree compute effort, cost and progress the same way | Done — Phase 3 | `scope/domain/WbsComponent`, `scope/domain/WbsTree` |
| Observer (domain events)       | Snapshot read models, WBS roll-up, notifications react to changes without coupling modules | Done — Phases 2–3 | `UserProfileChanged` → `OrganizationEventListeners`; `ProjectChanged`/`WbsChanged` → `reporting/application/SnapshotRefresher` |
| Chain of Responsibility        | Change-request approval levels (PM → PMO → Sponsor) decided by configurable rules         | Planned — Phase 6  | —     |
| Transactional outbox           | Events are never lost or sent for a rolled-back change (Modulith publication registry)    | Planned — Phase 8  | —     |
| Template Method + Factory      | Report exporters share load → build → render → store; a new format is one new class       | Planned — Phase 9  | —     |

## Phase 0

No application patterns yet; Phase 0 is tooling. Two structural rules are already enforced by the build:
module boundaries (Spring Modulith `verify()`) and inward-only layering inside a module (ArchUnit), see
ADR 0004.

## Phase 1

Still plumbing rather than domain patterns, but two structural ideas landed in the `platform` module:

- **Exceptions as a port to HTTP.** Domain and application code throw `ProblemException` subclasses that know a
  `ProblemKind` and a `code` but nothing about HTTP; `ProblemDetailsHandler` is the one adapter that turns them into
  status codes and Problem Details (`platform/error`, `platform/web/ProblemDetailsHandler.java`).
- **Servlet filter chain** (a Chain of Responsibility provided by the Servlet API): `CorrelationIdFilter` then
  `AccessLogFilter`, each doing one job and passing the request on (`platform/web`).

## Phase 2

- **Dependency inversion across modules.** `/me` needs memberships, which belong to the organization module, but
  identity must not depend on it (that would be a cycle, and `ModularityTests` would fail). Identity declares the
  port `MembershipDirectory`; organization implements it (`MembershipDirectoryService`).
- **Scoped context objects** instead of passing the tenant through every method: `TenantScope` and
  `CurrentMember` are `ScopedValue`s bound once per request by `TenantFilter`.
- The **Builder** row moves to Phase 3: integration tests create data through the real endpoints
  (`support/TestAccounts`), which proved simpler than fixture builders so far.

## Phase 3

- **Policy object** for authorization: `portfolio/application/ProjectAccessService` is the single answer to "may the
  caller see / change this project?", reused by the charter, the WBS and the dashboard (and later tasks, risks...).
- **Value object**: `platform/money/Money` makes wrong money arithmetic (mixed currencies, float drift, silently
  rounded minor units) impossible to write.
- **CQRS-lite read model**: the dashboard reads `project_snapshots`, a denormalized table the Observer above keeps
  exact; writes stay in the owning modules.
