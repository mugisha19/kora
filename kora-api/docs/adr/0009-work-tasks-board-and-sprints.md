# 0009 — Work: tasks, the board and sprints

- Status: Accepted
- Date: 2026-09-27

## Context

Phase 4 builds features 08–09: tasks with a lifecycle, the Kanban board with WIP limits, the product backlog,
sprints, burndown and velocity. Tasks are also where the WBS gets real progress: until now a work package's percent
complete was typed in by hand (ADR 0008).

## Decision

**A `work` module.** It depends on `portfolio` (project access), `scope` (work packages) and `organization`. Two
things flow the other way, and neither creates a dependency cycle:
- **Progress to the WBS through a port.** `scope` defines `WorkPackageProgress` and `work` implements it. Scope finds
  the implementation at runtime (`ObjectProvider`), so it never depends on work.
- **Changes to the dashboard as an event.** `reporting` listens to work's `TaskChanged`.

**Who may do what.** `ProjectAccess` gains `participating(projectId)`:
- The project's managers (the manager, `PMO`, `ORG_ADMIN`) change any task. Only they delete tasks, configure
  columns, run sprints and reopen `DONE` work.
- `CONTRIBUTOR` team members create tasks and comment. They change and move tasks assigned to them or to nobody.
- Observers, and an organization `VIEWER` even when listed as a contributor, only read.
- An assignee must be the project manager or a contributor on the team.

**Task lifecycle (State).** `TaskStatus` lists each state's next states:
- `BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE`, with steps back.
- `BLOCKED` is reached from `TODO` or `IN_PROGRESS`, with a reason.
- `DONE → TODO` reopens, for managers only.
- A move to the same status is a reorder. Skipping review is not expressible.
- `DONE` requires no remaining hours (`409 tasks.remaining_work`), so "finished" and "hours left" can't both be true.

The status changes only through `POST /tasks/{id}/move`, which also sets the position. One request per drag and
drop, so the board can't end up with the status saved but the position lost.

**Ordering: lexorank.** A task's `rank` is a base-36 string. A move computes a key between its new neighbours (`Rank`)
and writes one row, instead of renumbering a column. Details:
- There is one order per project. A column or the backlog shows the tasks filtered and sorted by the same key.
- With only one neighbour given, the other is the project-wide next task, so "directly below X" holds in every view.
- Keys are compared byte by byte (`COLLATE "C"`) and never end in `0`, so a gap always exists.
- Keys grow by about one character every six inserts into the same gap. Rebalancing is left until a key nears the
  255-character column (roughly 1,000 inserts into one gap).
- Concurrent moves into the same gap can produce equal keys. The tie is broken by creation time, and the next move
  separates them.

**Keys.** A task key is the project code plus a per-project number (`AKG-12-34`). The number comes from a
`task_sequences` row created with `INSERT … ON CONFLICT DO NOTHING` and read under a row lock, so concurrent creates
never repeat a key. The key is stored because project codes never change.

**WIP limits.** Columns store only the settings someone changed; defaults cover the rest.
- Moving into a column at its limit is `409 tasks.wip_limit_reached` unless the request says `override: true`.
- Overrides are logged until the audit trail exists (Phase 8).
- Counts are project-wide, including on a sprint-filtered board, so the board shows exactly what the move check
  enforces.

**Sprints.** Sprints are for Agile and Hybrid projects only (`409 sprints.not_agile`).
- `PLANNED → ACTIVE → CLOSED`, with at most one active sprint per project. The service checks this, and a partial
  unique index enforces it in the database.
- Starting a sprint freezes `committedPoints`.
- Closing records `completedPoints` and moves unfinished tasks to a planned sprint or back to the backlog. Finished
  tasks stay with the sprint they were finished in.
- A closed sprint is history (`409 sprints.closed`).
- The backlog is every unfinished task in no sprint, in rank order.

**Burndown.** `sprint_day_progress` holds one row per sprint and day: the story points still open. It is written:
- by a synchronous listener on `TaskChanged`, in the changing transaction;
- by an hourly pass, so a quiet day still has a value;
- with an upsert, so concurrent changes can't collide.

"Today" is the organization's day. The ideal line falls evenly from the commitment to zero. A day without a row
repeats the previous value; future days have none. Velocity is the completed points of the last N closed sprints,
with their average and range as the forecast.

**Work package progress from tasks.** A finished task counts 100%. An unfinished task counts
`(estimate − remaining) / estimate`, or 0% without an estimate. Tasks are weighted by their estimate, with at least
one hour.
- A work package with tasks reports that value and says so (`percentCompleteSource: TASKS`).
- Entering its percent by hand is rejected.
- It can't become a deliverable while tasks point at it.
- Deleting a work package keeps its tasks (`ON DELETE SET NULL`).

## Alternatives considered

- **Integer positions per column.** Simple, but every insert renumbers the rows below it, and two concurrent moves
  conflict on many rows.
- **A status field on PATCH.** Two requests per drag and drop, and a way to skip the move rules.
- **`MAX(number) + 1` for keys.** Races under concurrency, and a key would be reused after its task was deleted.
- **Computing the burndown from task history.** Needs the audit trail (Phase 8) and replays history on every read;
  a daily snapshot is what Scrum tools show anyway.
- **Letting `scope` query tasks directly.** Creates a `scope ↔ work` cycle; the port keeps one direction.

## Consequences

- Every change to tasks publishes `TaskChanged`; the dashboard and the burndown follow in the same transaction.
- Clearing an assignee, work package or date through PATCH is not possible yet: the contract treats null as
  "unchanged". It will be added with explicit nulls when the web app needs it.
- The audit trail (Phase 8) will record WIP overrides, which are only logged for now.
