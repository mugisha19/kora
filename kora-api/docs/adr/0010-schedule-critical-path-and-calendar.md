# 0010 — Schedule: critical path, baselines and the working calendar

- Status: Accepted
- Date: 2026-09-27

## Context

Phase 5 builds feature 10. Plan-driven projects need task dependencies and a schedule computed from them: when each
task can start and finish, which chain of tasks decides the finish date, and how far the plan has slipped against a
saved baseline. Durations and lags are counted in working days, so the organization needs a working calendar.

## Decision

**A `schedule` module.** It depends on `work` (tasks), `portfolio` (project access and dates) and `organization`.
- `work` exposes `WorkQueries.schedulable(projectId)`, a read-only view of tasks.
- Tasks gain the scheduling inputs they own: `durationDays` (0 is a milestone) and a start-no-earlier-than
  constraint.
- `schedule` owns dependencies, baselines and the working calendar.

**Strategy: the critical path method.** `SchedulingStrategy` turns activities and links into timings. The strategy
is chosen in `SchedulingConfiguration`, and the domain stays free of Spring. `CriticalPathMethod` works in O(V + E):
- Kahn's topological sort orders the tasks and detects loops.
- The forward pass gives early start and finish from the four link types (FS, SS, FF, SF, each with lag or lead)
  and the constraint.
- The backward pass from the project finish gives late start and finish.
- Total float is late start − early start; critical means total float ≤ 0.
- Free float is the slack before the first successor has to move.

The unit tests check a textbook network, every link type, leads, constraints and milestones against hand-worked
values.

**Working days as numbers.** The calculation uses day numbers from the project start (day 0 is the first working day
on or after it). `WorkingDays` maps numbers to dates and back, skipping non-working weekdays and holidays:
- CPM stays pure integer arithmetic.
- The calendar is applied only at the edges.
- A finish is shown as the task's last working day; a milestone finishes on its start.
- Variances against a baseline are differences in day numbers, so they are in working days.

**Computed on every request, never stored.** A project has hundreds of tasks and the calculation is linear, so it
runs in milliseconds. A stored schedule would need invalidating on every task, dependency and calendar change, and
could be stale. The feature spec suggests recalculating on events; with nothing stored there is nothing to
recalculate. A stored copy can come later if profiling shows a need (Phase 10).

**No loops, checked twice.**
- A new link is refused before it is saved when a path already leads from its successor back to its predecessor.
  The check is a breadth-first search, so the loop reported is the shortest one.
- `GET /schedule` still handles a loop defensively; Kahn names the stuck tasks.
- Both answer `409 schedule.cycle`, with the chain of task keys in `errors[0].params.cycle` for the web app to show.

**Baselines** are numbered per project and immutable. Saving one records every task's current early dates. The
schedule reports variances against the latest baseline. Re-planning saves a new baseline, so the history of
re-plans stays visible (and later audited).

**Working calendar per organization.**
- It is stored only once an administrator changes it; until then it is Monday to Friday with no holidays.
- The first change saves the default at version 0, then updates it to version 1, so the ETag protocol holds from
  the very first change.
- Holidays are a JSON list on the row: small, always read whole, never queried alone.

**Methodology.** Dependencies and baselines are for Predictive and Hybrid projects (`409 schedule.not_predictive`),
as sprints are for Agile and Hybrid ones. Reading the schedule works for every project; without links, every task
simply starts on day 0.

**A task without a duration takes one day**, so it still appears on the chart and its links mean something.

## Alternatives considered

- **Storing early and late dates on tasks.** Every edit would need a recalculation that writes many rows, and a
  missed event leaves the chart wrong.
- **Calendar-day arithmetic with weekend skipping inside CPM.** It mixes two concerns and makes the textbook tests
  unreadable.
- **A graph database or a recursive CTE for loop checks.** Unnecessary: one project's network fits in memory.
- **Letting the schedule write task start and due dates.** It would overwrite what people entered. The schedule is
  a forecast next to the plan, not a replacement for it.

## Consequences

- Scheduling changes (durations, constraints, links, calendar) show immediately with no extra wiring.
- Dashboard health still uses "past the target end date" rather than the forecast finish; the forecast feeds health
  with SPI in Phase 7.
- Capacity planning (Phase 7) reuses the working calendar.
