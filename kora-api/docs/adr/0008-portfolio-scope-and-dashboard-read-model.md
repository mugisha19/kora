# 0008 — Portfolios, scope and the dashboard read model

- Status: Accepted
- Date: 2026-09-27

## Context

Phase 3 builds features 04–07: portfolios, programs and projects, the project charter, the work breakdown
structure and the portfolio dashboard. Every later feature (tasks, schedule, risks, time, EVM) hangs off a project,
so how projects are guarded, how money is represented and how cross-module read models are fed are decided here.

## Decision

**Modules and direction.** `portfolio` (portfolios, programs, projects, team, charter), `scope` (WBS) and
`reporting` (dashboard). Dependencies only point one way:
`reporting → scope → portfolio → organization → identity`. Spring Modulith verifies there is no cycle. When a
lower module needs something from a higher one, it defines a port and the higher module implements it
(`CurrencyUsage`, as `MembershipDirectory` in Phase 2).

**One project access policy.** `ProjectAccess` decides for every module:
- `ORG_ADMIN` and `PMO` see and change every project.
- The manager changes their project; team members see it.
- Anyone else gets `404`, as if the project didn't exist.
- A visible project the caller may not change is `403`.
- Anything in an archived portfolio is `409 portfolios.archived`.

The charter's sponsor is added to the team as an observer, so they can see what they approve.

**Lifecycle.** A State pattern (`ProjectStatus`). `PROPOSED → APPROVED` only happens by approving the charter,
so the PMBOK authorization step can't be skipped with a status change. A reason is required for `ON_HOLD` and
`CANCELLED`. The methodology is fixed once the project leaves `PROPOSED`.

**Charter.** One row per version; `DRAFT → SUBMITTED → APPROVED → SUPERSEDED` (State pattern). Approved versions are
never edited (a change request supersedes them, Phase 6). The lists (objectives, scope, milestones) are JSON text
columns: always read and written with their charter, never queried alone.

**WBS.**
- **Storage:** an adjacency list with a sibling `position`. Codes (`1.2.3`) are derived when the tree is
  assembled, so moves never rewrite codes. A project's tree is loaded with one query and assembled in memory
  (`WbsTree`), which also enforces the structural rules: only deliverables have children, at most 8 levels, no
  moving under one's own descendant. A materialized path would only pay off for querying subtrees across a
  project, which nothing needs.
- **Roll-up:** a Composite (`WbsComponent`). Progress is weighted by planned effort, falling back to a plain
  average when no effort is planned.
- **Percent complete:** work packages carry a manually reported *physical* percent complete until tasks exist
  (Phase 4).
- **Locking:** `parent` and `position` are excluded from optimistic locking, so reordering siblings doesn't make
  concurrent renames fail.

**Money.** `Money(BigDecimal, currency)` is scaled to the currency's minor units and rejects extra decimals instead
of rounding them away. Arithmetic rounds half-even. JSON carries amounts as decimal strings. Every amount is in the
organization's currency, which is locked (`409 organization.currency_locked`) once any module reports an amount
in it.

**Dashboard read model (CQRS-lite, Observer).** `project_snapshots` holds one denormalized row per project. It is
rebuilt by *synchronous* listeners on `ProjectChanged` and `WbsChanged`, inside the transaction that made the
change, so the dashboard is never behind a commit and a rollback leaves no trace. An hourly pass catches what time
alone changes (a project becoming late).

The health rule (feature 05) is documented in `HealthRule`. Its computed value is stored on the project but
excluded from optimistic locking, so a recomputation never causes a user's save to fail with 412. A manager's
override (with a reason) wins. SPI, CPI and risk inputs are absent until Phases 6–7, and the rule skips absent
inputs rather than guessing. Until milestones are scheduled (Phase 5), "past the target end date" stands in for
"late milestone".

**Today is the organization's today.** Date rules (lateness now; deadlines and timesheet weeks later) use the
organization's time zone (`OrganizationTimeZone`), not UTC. A test caught the difference: two hours a day, Kigali is
already on tomorrow.

**No Redis cache for the dashboard yet.** The dashboard reads one indexed table filtered by organization. A 60-second
cache (as the feature spec suggests) would add invalidation and visibility-keying complexity before there is a
measured need; it is revisited with the performance work in Phase 10. `GET /dashboard/trends` is deferred to
Phase 7, when EVM snapshots give it data.

## Alternatives considered

- **Aggregating the dashboard live across modules** — simple, but every request joins across tables owned by
  different modules, and the dashboard's cost grows with every feature that adds an input.
- **Asynchronous snapshot updates** — decouples writes from the read model, but without the transactional outbox
  (Phase 8) an event can be lost; synchronous listeners keep the read model exact for now.
- **Materialized path or `ltree` for the WBS** — fast subtree queries nobody runs; the whole tree is always needed.
- **A manual `PROPOSED → APPROVED` transition** — lets a project start without an approved charter.
- **Amounts as JSON numbers** — clients (JavaScript) would parse them into binary floats.

## Consequences

- New project-scoped modules call `ProjectAccess` and inherit the same 404/403/409 behaviour.
- Every change that should move the dashboard must publish `ProjectChanged` or `WbsChanged`.
- Health gets richer without API changes as SPI, CPI and risks arrive.
