# 0008 — Kanban board, backlog and sprints

- Status: Accepted
- Date: 2026-09-27

## Context

Features 08–09 (contract 0.3.0, 21 operations) add the day-to-day work: tasks with a lifecycle,
a Kanban board with WIP limits, a ranked product backlog, sprints with a frozen commitment,
burndown and velocity. The API owns the lifecycle, the ranks (opaque lexorank strings,
project-wide), WIP counts and every figure; drag and drop must have a keyboard equivalent, and
task text is Markdown that must never render as HTML.

## Decision

- **One move call.** Status and position change together through `POST /tasks/{id}/move`
  (`afterTaskId` = the card above, `beforeTaskId` = the card below, both absent = last). Ranks
  are only compared, never computed or parsed. A drop and a "Move to…" menu item produce the
  same request.
- **Optimistic board, server truth.** `BoardStore` keeps tasks as entities (`withEntities`) and
  columns as settings plus the API's project-wide WIP counts. A dropped card moves at once
  (a temporary sort key places it between its neighbours), then the board reloads: on success it
  shows the real rank and counts; on refusal the card is back where it was and the reason is
  toasted. The board doesn't mirror WIP counts itself.
- **The lifecycle mirrored for affordances only.** `TASK_NEXT` (the API's state machine) decides
  which columns a card can be dropped on (`cdkDropListEnterPredicate`) and which "Move to…" items
  appear; the API still enforces it.
- **`TaskFacade`** (provided per tab) is the one place that opens the task side sheet with the
  caller's rights (managers do everything; contributors change tasks that are theirs or
  unassigned; observers read) and runs moves: it asks for a reason before blocking, offers "Move
  anyway" on `tasks.wip_limit_reached` (in the UI's language, not the API's English detail), and
  toasts other refusals (moves are `silent()` in the interceptor because the board handles them).
- **Keyboard equivalents and announcements.** Every card has a "Move" menu (up, down, each
  allowed column); the backlog has Move up/down buttons. Moves are announced
  ("Moved AKG-001-49 to Blocked, position 2 of 2.") and focus returns to the moved card's Move
  button — reordering a DOM node drops focus otherwise.
- **Filters in the URL** (`?sprint=&assignee=&type=&label=&lanes=assignee`), as for lists. The
  board shows the active sprint by default. Swimlanes group cards by assignee; a drop stays within
  its lane.
- **Safe Markdown without a library.** `<kora-markdown>` parses a small subset (paragraphs,
  lists, bold, italic, code, fenced code, http/https/mailto links) into blocks that the template
  renders with interpolation — no `innerHTML`, so raw HTML shows as text and can't run.
- **Sprint charts.** Burndown (ideal dashed, actual solid with markers) and velocity (committed
  and completed bars, average line, "low–high" forecast in words) use ECharts line/bar through a
  second lazy setup on the backlog route; each has its numbers in a table under "Show the data".
  esbuild puts the ECharts code shared by the dashboard donut and these charts in one lazy chunk
  (≈ 568 kB, 164 kB compressed), so the "any bundle" budget is now 600 kB warning / 700 kB error;
  it only loads when a chart scrolls into view. The initial bundle is unchanged (≈ 697 kB).
- **Unit tests answer instantly.** The mock API's simulated latency (100–400 ms per request in
  jsdom) is off in unit tests (`setMockLatency(0)`); pages chaining several requests otherwise
  raced Testing Library's waits under full-suite load. The browser keeps it.

## Consequences

- The board survives rule changes on the server (new transitions, different WIP semantics)
  because it only renders what the API returns after each move.
- Two known gaps, planned: live updates between browsers (feature 18, STOMP, Phase 9 — the
  acceptance criterion "two browsers see each other's moves within 1 s" is deferred), and task
  attachments and history in the side sheet (features 19–20).
