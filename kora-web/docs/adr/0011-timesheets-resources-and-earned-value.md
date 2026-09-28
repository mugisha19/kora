# 0011 — Timesheets, resources and earned value

- Status: Accepted
- Date: 2026-09-28

## Context

Features 15–17 (contract 0.6.0) add the cost side of the platform: weekly timesheets per person
and project, approved by the project's managers; capacity (weekly hours less holidays and leave),
planned hours per person, week and project, and a utilization heat map; earned value (PV, EV, AC,
SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI) with an S-curve, per-project methods, and the portfolio's
SPI/CPI trend on the dashboard. The API owns every number: money arrives as decimal strings,
indices are rounded half-even to two decimals, and the health rule now reads SPI and CPI. The UI
has to make time entry fast from the keyboard, keep what a person types, and explain the figures
to people who have never heard of EVM.

## Decision

- **One grid per week, autosaved.** `/timesheets` and `/timesheets/2026-W40` (the form the
  notifications use) show tasks × days. A route-scoped `TimesheetStore` (`@Injectable()`, plain
  signals) holds the rows as text, parses them (`parseHours`: quarter hours, 0–24, a decimal
  point or comma) and saves 800 ms after the last change with `PUT …/entries`. Invalid cells or a
  day over 24 hours across projects block saving and submitting, and say why in the status line;
  nothing typed is lost. Arrow keys and Enter move between cells (one handler on the focusable
  grid wrapper). "Copy last week's tasks" adds rows only; submitting asks for confirmation with
  the week's total.
- **Weeks and "today" in the organization's time zone.** `OrgClock.today()` uses the
  organization's time zone; ISO-week helpers (`shared/format/iso-week.ts`) work on `yyyy-mm-dd`
  strings in UTC, so no browser time zone moves a day.
- **Approval where the project is managed.** The workspace's Time tab lists the project's
  submitted weeks for its managers (a week over 50 h is flagged; a manager's own week shows that
  the PMO approves it), with the week in a read-only dialog, approve, and send back with a
  required comment. The Time and Earned value tabs join every methodology's tabs.
- **Planned hours as a what-if.** The Time tab's grid of planned hours for the next 8 weeks is a
  local draft: each cell shows the person's utilization across _all_ projects if the draft were
  saved (heat map hours − saved + draft), in words and with an icon; nothing is sent until "Save
  planned hours". Weekly hours use their own parser (`parseWeeklyHours`, 0–168), not the day's.
- **The heat map is a table.** `/resources` shows people × weeks with the percentage, the band in
  words (Under < 70%, Healthy 70–100%, Over > 100%) and a hidden sentence with planned, capacity
  and logged hours; the start week, number of weeks and team are query parameters. A person opens
  a side sheet with capacity history, leave (their own, or anyone's for the PMO and admins) and —
  for the PMO and admins only — cost rates.
- **EVM explained in words.** The Earned value tab shows SPI and CPI as gauges with the health
  rule's zones (0.80 and 0.95) and a sentence each ("For every RWF 1 spent, 1.08 of work is
  earned"), the money figures as cards with a hint or the API's reason when a metric can't be
  computed, and the S-curve (PV, EV, AC, with BAC and EAC lines) with its data in a table.
  Managers choose the percent-complete and EAC methods (If-Match; a 412 shows the other person's
  choice). The dashboard adds the portfolio's SPI/CPI by month, thresholds drawn, with the same
  data in a table.
- **Public holidays in one click.** Admin → Calendar adds Rwanda's public holidays for this year
  or the next (the API computes Easter and Umuganura; the Eid dates are added by hand), only when
  there are no unsaved local changes.
- **Exact money in the mock.** The mock computes EVM with BigInt units (`mocks/evm.ts`, tested
  against textbook figures) so the demo matches the API's rounding.

## Consequences

- Time entry never loses keystrokes, and a mistake is explained before anything reaches the API.
- Rights stay the API's: the UI hides approve/send back, leave and cost rates from people who
  can't use them, and shows the API's refusal if the two disagree.
- Plural wording isn't supported by the translation setup yet; counts that can be 1 are written
  as "Label: count" until plural support lands.
- The heat map and planned hours are recomputed on the server after each save; large
  organizations may need paging by team (the API caps a heat map at 26 weeks).
