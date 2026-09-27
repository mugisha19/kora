# Design patterns in kora-api

Patterns are used only where they solve a real problem. Each row gets file paths when the pattern actually
lands in code; a pattern that doesn't earn its place is rejected in an ADR.

| Pattern                        | Problem it solves in Kora                                                                 | Status             | Where |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ | ----- |
| Ports and adapters (Adapter)   | Email, token store, file storage, clock behind interfaces; in-memory fakes in tests        | Done — Phase 2     | `platform/mail/EmailSender`, `identity/application/RefreshTokenStore` + `adapter/redis`, `*Repository` ports + `adapter/persistence` |
| Strategy                       | Password hashing; CPM scheduling; EAC and percent-complete methods; methodology rules     | Done — Phases 2, 5, 7 | `PasswordHasher`, `schedule/domain/SchedulingStrategy`, `performance/domain/PercentCompleteMethod`, `EacMethod` |
| State                          | Lifecycles where illegal moves must be impossible: invitation, project, charter, task, issue, change request | Done — Phases 2–6 | `InvitationStatus`, `ProjectStatus`, `CharterStatus`, `TaskStatus`, `governance/domain/IssueStatus`, `ChangeRequestStatus` |
| Specification                  | Composable, tenant-safe filters for list endpoints (members, projects, tasks, risks)      | Done — Phases 2–4  | `MemberSpecifications`, `portfolio/adapter/persistence/PortfolioSpecifications` (incl. project visibility), `work/adapter/persistence/TaskSpecifications` |
| Builder                        | Readable test fixtures and the demo data seeder                                           | Planned — Phase 2  | —     |
| Composite                      | WBS roll-up: a work package and a whole subtree compute effort, cost and progress the same way | Done — Phase 3 | `scope/domain/WbsComponent`, `scope/domain/WbsTree` |
| Observer (domain events)       | Snapshot read models, WBS roll-up, notifications react to changes without coupling modules | Done — Phases 2–4 | `UserProfileChanged` → `OrganizationEventListeners`; `ProjectChanged`/`WbsChanged`/`TaskChanged` → `reporting/application/SnapshotRefresher`; `TaskChanged` → `work/application/BurndownRecorder` |
| Chain of Responsibility        | Change-request approval levels (PM → PMO → Sponsor) decided by configurable rules         | Done — Phase 6     | `governance/domain/ApprovalHandler` |
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

## Phase 4

- **State** again, for tasks: `work/domain/TaskStatus`. The same shape as projects, plus a rule that depends on who
  asks (only managers reopen `DONE`), passed in rather than looked up, so the domain stays free of security code.
- **Dependency inversion across modules**: `scope/WorkPackageProgress` is a port owned by the module that *uses* the
  data and implemented by the module that *has* it (`work/application/WorkPackageProgressService`). The WBS gets task
  progress without a `scope → work` dependency.
- **Snapshot for time series**: `SprintDayProgress` stores one value per day instead of replaying history, the
  same trade-off as the dashboard read model.

## Phase 5

- **Strategy** for scheduling: `schedule/domain/SchedulingStrategy` with `CriticalPathMethod`, chosen in
  `SchedulingConfiguration`. A resource-levelling or Monte Carlo scheduler would be another implementation, with
  the controllers and the calendar untouched.
- **Separating calculation from representation**: CPM works on working-day numbers; `WorkingDays` translates to
  dates at the edges. The algorithm stays textbook-simple and the calendar rules stay in one class.
- **Graph algorithms**: Kahn's topological sort (order and loop detection) and breadth-first search (the shortest
  loop a new link would close) in `schedule/domain/DependencyGraph`.

## Phase 6

- **Chain of Responsibility**: `governance/domain/ApprovalHandler` with `ProjectManagerApproval`, `PmoApproval` and
  `SponsorApproval`. Each handler decides whether its level must approve; adding a level is one class linked into the
  chain.
- **Anonymization over deletion** for personal data: `Stakeholder.remove()` erases what identifies the person and
  keeps the row, so references and history survive.
- **Ports for cross-module writes**: `portfolio.ProjectChangeControl` and `schedule.SchedulePlanning` let an approved
  change reach other modules' baselines in one transaction without handing out manager rights.

## Phase 7

- **Strategy** twice in EVM: `PercentCompleteMethod` (physical, 0/100, 50/50, story points) and `EacMethod` (typical,
  atypical, composite), chosen per project in `EvmSettings`. Enum-based strategies: a closed, documented set,
  each with its own behaviour.
- **Snapshot** for history that can't be recomputed: `EvmSnapshot` keeps each week's EV, as `SprintDayProgress` keeps a
  day's remaining points.
- **Derived aggregate status**: `TimesheetWeek` summarizes several per-project timesheets into the one week a person
  sees, without storing a second status that could disagree.

## Phase 8

- **Transactional outbox**: Spring Modulith's `event_publication` table stores each event for each listener in the
  transaction that raised it. Listeners (`notifications/application/NotificationDispatcher`) run after the commit, and
  unfinished ones are resubmitted, so delivery is at least once. **Idempotent receiver** on top: the event key is
  unique per recipient.
- **Observer below the services**: `platform/audit/EntityChangeAuditor` listens to Hibernate's insert, update and
  delete events, so every entity is audited without a line in any service. Opting out takes `@NotAudited` and a reason.
- **Hash chain** (tamper evidence): each audit row hashes its content with the previous row's hash
  (`AuditChain`). Editing or deleting a row breaks every link after it, and `GET /audit/verify` names the first one.
- **Projection instead of a second write**: the project activity feed is a filtered view of the audit trail, so the
  two can never disagree.
- **Adapter** for storage: `attachments/application/FileStorage`, with `S3FileStorage` for S3 and compatible stores.
  **Adapter** for live delivery too: `LivePush`, with `StompLivePush`.
- **Interceptor** for authorization: `StompAuthorization` checks every inbound STOMP frame (CONNECT, SUBSCRIBE, SEND)
  before the broker sees it, with the same rules as REST.

## Phase 9

- **Template Method**: `reports/application/ReportExporter.export` fixes the steps of every export (load the data,
  build the document, render, store); `PdfReportExporter` and `ExcelReportExporter` supply only `render` and their file
  type.
- **Factory**: `ReportExporterFactory` picks the data source by report type and the exporter by format, both
  discovered as beans; a new format is one new class.
- **Plug-in interface across modules**: `reports.ReportSource` is implemented by the modules that own the data
  (reporting, governance, performance, resourcing). The dependency points toward `reports`, which knows none of them.
- **Intermediate representation**: `ReportContent` of typed `Cell`s (a sealed interface) separates what a report says
  from how a format shows it, so PDF formats amounts in the reader's language while Excel keeps them as numbers.
- **Background job with a claim check**: the request stores a job and an event; the worker generates the file, puts it
  in object storage, and the job keeps only the key and a short-lived link.
- **Seeding through the public API**: `demo/DemoStory` drives Kora's own REST API as its users, so demo data obeys
  every rule; the owning modules backfill history the API can't create (`platform.demo.DemoHistory`).
