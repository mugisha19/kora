# 0012 — Timesheets, capacity and earned value

- Status: Accepted
- Date: 2026-09-27

## Context

Phase 7 builds features 15–17 and finishes what features 05 and 10 left open.
- Timesheets record actual hours and their cost.
- Capacity planning compares people's availability with their allocations.
- Earned value management measures schedule and cost performance from the plan, the work done and the money spent.
- The dashboard gets SPI, CPI, trends and the counts reserved in contract 0.2.0.
- Project health gets the schedule forecast.

## Decision

**Two modules.**
- `resourcing` holds timesheets, cost rates, capacity, leave and allocations.
- `performance` holds EVM.
- The chain is one-way: `reporting → performance → resourcing → work/portfolio`, and `performance` also reads `scope`
  and `schedule`.
- Each exposes a small query API: `ActualCosts`, `EvmQueries` and, in schedule, `ScheduleQueries`. No module reads
  another's tables.

**One timesheet per person, project and week.** Feature 15 has project managers approve "time on their projects".
- A person on two projects has two timesheets in a week, each approved by its own project's managers.
- The person still sees one week. Its status is derived: APPROVED when all parts are approved, REJECTED when any is
  rejected, SUBMITTED when all parts are submitted or approved, DRAFT otherwise.
- Saving the week replaces the editable parts. Submitted or approved parts must come back unchanged
  (`409 timesheets.locked`), so a client can always send the whole week.
- A day holds at most 24 hours across projects. Hours are quarter hours.
- Nobody approves their own time (`409 timesheets.self_approval`): a project manager's own hours go to the PMO or an
  administrator, as change requests do (ADR 0011).
- Entries copy the task's key and title, and a deleted task only unlinks them (`ON DELETE SET NULL`). Logged time,
  and the actual cost it carries, never disappears with a task.

**Cost.** Approved hours are costed at the person's rate valid on the day worked (`cost_rates` history), so a raise
never rewrites past cost. Hours of someone without a rate cost nothing but are reported as `unratedHours`, so an
understated AC is visible instead of silent. Rates are confidential: only `ORG_ADMIN` and `PMO`.

**Capacity.** Weekly capacity = weekly hours (history, 40 by default) × the week's working days left after the
organization's holidays and the person's leave ÷ the normal working days.
- Allocations are hours per person, project and week.
- Utilization is allocated ÷ capacity, banded under 70%, healthy up to 100%, over above.
- Rwanda's fixed and Easter-based public holidays can be added to the calendar for a year. Eid dates follow the
  moon and are announced yearly, so administrators add them by hand rather than trusting a computed guess.

**EVM.**
- **BAC** is the WBS's planned cost.
- **PV** spreads each work package's planned cost evenly over its baseline window: the earliest baseline start to the
  latest baseline finish of its tasks. Work packages without baselined tasks spread over the project's start to
  target end. Calendar days are used; working-day phasing would refine the curve, but not the totals.
- **EV** follows the project's percent-complete **Strategy**: physical %, 0/100, 50/50 or story points.
- **AC** is approved hours × rates.
- **EAC** is the chosen **Strategy**: typical BAC×AC÷EV, atypical AC+(BAC−EV), or composite
  AC+(BAC−EV)×AC×PV÷EV².

The EAC formulas are evaluated on the amounts, never on rounded indices, and money is rounded half-even to the
currency's minor units only at the end. That is how the textbook example comes out exactly and why
`1000 × 400 ÷ 333.33` gives 1,200.01 and not 1,204.82. Anything that would divide by zero is omitted and listed in
`unavailable` with the reason.

**Snapshots.**
- Each project's cumulative PV/EV/AC is written hourly into the current week's `evm_snapshots` row. The row keeps the
  week's last figures once the week ends.
- The S-curve takes EV from snapshots for past weeks and live figures for this week. PV is always computable and AC
  is computable up to today.
- Trends sum each project's latest snapshot per month, and portfolio indices are Σ EV ÷ Σ PV, so big projects weigh
  more than small ones.

**Health and the dashboard.**
- `HealthRule` now gets real SPI and CPI (red below 0.80, amber below 0.95).
- For Predictive and Hybrid projects, a schedule forecast finish later than the target end date is amber.
- The snapshot stores PV, EV, AC, SPI, CPI and the open-critical-risk and pending-change counts. It refreshes on
  approved hours and change-request movements as well.

## Alternatives considered

- **One timesheet per person-week approved by one manager.** Wrong approver for everyone working across projects.
- **Deleting time with its task.** Silently lowers actual cost after the fact.
- **Computing EV history from task history.** Needs the audit trail (Phase 8), and replays history on every chart.
- **Indices from rounded values** (`BAC ÷ 0.83`). Visible rounding errors in money.
- **Stored daily PV.** It is a pure function of the baseline and a date, so there is nothing to store.

## Consequences

- AC only counts approved time: submitted hours appear once their manager approves them.
- Changing a cost rate changes the cost of hours worked on or after its date; the hourly refresh brings the
  dashboard in line.
- Over-allocation and overdue-review notifications wait for Phase 8; the bands and flags are already in the API.
