# 0009 — Gantt chart, critical-path schedule and working calendar

- Status: Accepted
- Date: 2026-09-27

## Context

Feature 10 (contract 0.4.0, 7 operations) adds dependencies (FS/SS/FF/SF with lag or lead), a
critical-path schedule the API computes on every read, baselines, and the organization's working
calendar. The feature asks for a Gantt chart with dependency arrows, the critical path shown by
colour **and** pattern, baseline bars, a today line and day/week/month zoom; editing by dragging
(move, resize, link); a keyboard-accessible table with every edit; and a loop error that names
the chain. The Gantt choice had to be recorded: a permissively licensed library or our own SVG,
never GPL.

## Decision

- **Custom SVG, no Gantt library.** The open Gantt libraries are GPL (dhtmlxGantt's standard
  edition), commercial (Bryntum, DHTMLX Pro, Syncfusion), or MIT but built for their
  own DOM and styles (frappe-gantt), which would fight Material theming, i18n and our pointer and
  accessibility rules. The chart we need is small: bars, diamonds, elbow arrows, shaded days and
  two header rows. `GanttChart` renders it as one `<svg>` from pure geometry in
  `gantt-geometry.ts` (unit tested): calendar-day positions in UTC, header ticks per zoom, bar
  boxes and arrow paths by link type. No new dependency and no bundle cost beyond the tab's own
  lazy chunk.
- **The API computes, the UI draws.** The schedule (ES/EF/LS/LF, floats, critical flags,
  variances) comes from `GET /projects/{id}/schedule`; the UI never runs CPM. Every edit
  (duration, constraint, link) goes to the API and reloads the schedule, because one change can
  move every later task. The mock API runs its own CPM (`mocks/cpm.ts`, tested on the textbook
  network) so the demo behaves like the real thing.
- **Critical path without colour alone.** Critical bars are hatched (an SVG pattern, error colour
  with light stripes) and outlined; the task list next to the chart and the table say "Critical"
  in words; arrows between critical tasks are thicker. The legend shows every mark.
- **Dragging maps to the contract's fields.** Moving a bar sets a start-no-earlier-than
  constraint on the dropped day (the API decides where it can really start); resizing sets
  `durationDays` in working days counted on the organization's calendar; dragging the dot at a
  bar's end onto another bar adds a finish-to-start link. Pointer capture keeps the drag on the
  chart; a dashed outline previews the drop; each result is announced. Phones and keyboards use
  the table instead.
- **The table is the accessible equivalent.** Same data (dates, floats, critical, baseline
  variance in words, predecessors with type and lag) and every edit: an Edit dialog (duration,
  constraint, date), an "Add predecessor" dialog (predecessor, successor, type, lag, and the rule
  in a sentence), and a remove button per link. The chart itself is one `role="img"` with a
  summary label; the task names beside it are buttons that open the task.
- **Loops are named.** `schedule.cycle` carries the chain of task keys in `errors[0].params`;
  the dependency dialog, the chart (after a dragged link) and the tab (if a stored loop blocks
  the schedule) show it as "AKG-005-7 → AKG-005-2 → AKG-005-4 → AKG-005-6 → AKG-005-7".
- **View and zoom in the URL** (`?view=table`, `?zoom=day|month`), like list filters.
- **Working calendar** is an admin tab (`/admin/calendar`): working days as checkboxes, holidays
  added and removed locally, then saved together with `If-Match`; a 412 offers the other
  person's version. The Gantt shades the calendar's non-working days (weekends until it loads).
- **Task sheet** gains duration and constraint fields on Predictive and Hybrid projects.

## Consequences

- We own the chart's code (≈ 1,000 lines with template, styles and geometry), but it follows our theme,
  languages and accessibility rules without overrides, and it can't change licence under us.
- Very large schedules (hundreds of tasks) render every row; virtual scrolling can come later if
  needed.
- Dragging isn't unit tested in jsdom (no layout); the geometry is, and Playwright drags bars and
  links on a real page.
