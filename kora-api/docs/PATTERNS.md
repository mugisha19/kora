# Design patterns in kora-api

Patterns are used only where they solve a real problem. Each row gets file paths when the pattern actually
lands in code; a pattern that doesn't earn its place is rejected in an ADR.

| Pattern                        | Problem it solves in Kora                                                                 | Status             | Where |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ | ----- |
| Ports and adapters (Adapter)   | Email, token store, file storage, clock behind interfaces; in-memory fakes in tests        | Planned — Phase 2  | —     |
| Strategy                       | Password hashing; CPM scheduling; EAC and percent-complete methods; methodology rules     | Planned — 2, 5, 7  | —     |
| State                          | Lifecycles where illegal moves must be impossible: invitation, project, charter, task, issue, change request | Planned — 2–6 | — |
| Specification                  | Composable, tenant-safe filters for list endpoints (members, projects, tasks, risks)      | Planned — Phase 2  | —     |
| Builder                        | Readable test fixtures and the demo data seeder                                           | Planned — Phase 2  | —     |
| Composite                      | WBS roll-up: a work package and a whole subtree compute effort, cost and progress the same way | Planned — Phase 3 | — |
| Observer (domain events)       | Snapshot read models, WBS roll-up, notifications react to changes without coupling modules | Planned — 3, 8    | —     |
| Chain of Responsibility        | Change-request approval levels (PM → PMO → Sponsor) decided by configurable rules         | Planned — Phase 6  | —     |
| Transactional outbox           | Events are never lost or sent for a rolled-back change (Modulith publication registry)    | Planned — Phase 8  | —     |
| Template Method + Factory      | Report exporters share load → build → render → store; a new format is one new class       | Planned — Phase 9  | —     |

## Phase 0

No application patterns yet; Phase 0 is tooling. Two structural rules are already enforced by the build:
module boundaries (Spring Modulith `verify()`) and inward-only layering inside a module (ArchUnit), see
ADR 0004.
