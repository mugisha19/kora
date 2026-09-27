# 0007 — Portfolios, projects, dashboard, charter and WBS screens

- Status: Accepted
- Date: 2026-09-27

## Context

Features 04–07 (contract 0.2.0, 32 operations) bring the core project-management screens:
portfolios and programs, the project list and workspace, the lifecycle state machine, RAG health
with a manager override, the portfolio dashboard, the project charter with approval, and the work
breakdown structure with effort-weighted roll-ups. The API computes every derived value (health,
allowed transitions, WBS codes and roll-ups, dashboard read model); the UI must show them, never
recompute them, and must work with the keyboard alone, at 375 px, in three languages.

## Decision

- **The server decides, the UI renders.** Transition buttons come from `project.allowedTransitions`;
  health and its reason are shown as sent; WBS codes and rolled-up figures come from the tree the
  API returns. After a WBS change the tree is fetched again (or taken from the `/move` response)
  rather than patched locally, because a change ripples through every ancestor.
- **Methodology as a Strategy.** `METHODOLOGY_STRATEGIES` is the only place that says which
  workspace tabs a methodology has (Agile: board + backlog; Predictive: schedule; Hybrid: both).
  Tabs are router links (`/projects/:id/overview|charter|wbs|…`), so each has a URL and Back works.
- **Route-scoped stores.** `ProjectStore` is provided by the workspace route and shared by its
  tabs; `CharterStore`, `WbsStore` and `ProjectsStore` belong to their page. `ProjectStore.load`
  takes the route's input _signal_: reading the id inside an `effect` made the effect track the
  store's own state and reload forever.
- **Filters in the URL.** List pages bind query parameters as inputs
  (`withComponentInputBinding`) and change them through `QueryParams`
  (`router.navigate([], { queryParamsHandling: 'merge', replaceUrl: true })`). A shared link,
  a reload or Back restores the same view. The shell no longer moves focus to the heading when
  only the query changed (typing in a search box must keep focus) or when the navigation started
  in a `data-keep-focus` element (tab bars).
- **Detail routes match UUIDs only** (`uuidParam()`), so `/projects/new` for someone who can't
  create falls through to "page not found" instead of opening a workspace for the id "new". A 404
  on a detail page shows "not found", not a retry.
- **Money is a decimal string end to end.** `parseAmount()` turns what people type
  ("1 250 000", "99,90") into the canonical string for the currency; `Intl.NumberFormat` formats
  strings exactly. No binary floats touch amounts. `OrgDirectory` provides the organization's
  currency and people (for manager, owner and sponsor pickers) once per organization.
- **Accessible tree (WAI-ARIA tree pattern).** The WBS is `role="tree"` with nested
  `role="group"`s; each node is `WbsTreeNode`, a component whose host _is_ the `<li
role="treeitem">` and which renders its own children (the Composite pattern on screen). Roving
  tabindex; arrows move, open and close; Home/End; Enter edits; Delete removes; Alt+arrows reorder,
  indent and outdent — each is one `/move`. A toolbar offers the same commands on the selected
  node. The node's name is its code and title (`aria-labelledby`); its figures are its description,
  so a deliverable isn't announced with the text of all its descendants. Moves and deletes can be
  undone from the toast. Drag and drop and virtual scrolling (> 500 nodes) are deferred.
- **Charter lists are form arrays** with add, remove, move up/down buttons; moves are announced
  (`LiveAnnouncer`) and focus follows the moved item. Submit reports `charters.incomplete` as a
  list of the missing sections. Versions compare section by section, marked in words. The read
  view has a print stylesheet (the shell's toolbar and navigation are `no-print`).
- **Dashboard charts are progressive.** The health donut is ECharts (only core + pie + aria +
  canvas, ≈ 416 kB, loaded by `@defer (on viewport)` through `provideEchartsCore` on the dashboard
  route), hidden from assistive technology and patterned with ECharts decals; the same numbers are
  always in a table. The status distribution is plain CSS bars in its table — the bar chart pulled
  in ECharts' axis code (+ 90 kB) for no information the table doesn't already give. Chart colours
  are read from the theme tokens with a probe element per colour scheme (`light-dark()` only
  resolves on an element). Figures of later releases (SPI, CPI, risks, change requests) show "—".
- **Budgets.** The "any bundle" warning is 450 kB (was 400 kB) for that lazy ECharts chunk; the
  initial bundle is unchanged at ≈ 697 kB.

## Consequences

- Screens stay correct when the API's rules change (new transitions, a different health rule),
  because they don't encode them.
- Deep links to filtered lists and to each workspace tab work, and focus behaves.
- Two known limits: people pickers list the first 100 members (enough for the target
  organizations; a larger one needs a searchable picker), and a select rendered before
  translations load needs an explicit `<mat-select-trigger>` (Material only re-reads an option's
  label when the previous one was non-empty).
