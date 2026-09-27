# kora-web — progress

## Current status

Phase 5 complete (tag `web-v0.5.0`). Waiting for "continue".

## Next step

Phase 6 — dependencies, the critical-path schedule (Gantt) with baselines and the working calendar
(feature 10). Contract 0.4.0 is live since `api-v0.5.0`; see the backend notes in memory
(working days, critical = total float 0 shown with colour and pattern, `schedule.cycle` chain).

## Checklist

- [x] 0. Scaffold, lint/format/commit hooks, unit + e2e test setup, CI (GitHub + GitLab), docs
- [x] 1. Design system and app shell
- [x] 2. API client, mock layer (MSW), interceptors, error handling, dev proxy
- [x] 3. Auth, org switcher, guards, admin users/roles/invitations, settings profile
- [x] 4. Portfolio dashboard, projects, charter, WBS tree
- [x] 5. Kanban, backlog, sprints
- [ ] 6. Gantt with dependencies and critical path
- [ ] 7. Risks + heat map, issues, stakeholders, change requests
- [ ] 8. Timesheets, resource heat map, EVM dashboard
- [ ] 9. Real-time notifications, activity feed, attachments, report exports
- [ ] 10. E2E flows, performance, Nginx Docker image, final README; tag v1.0.0

## Phase 5 — what exists

- Mock API for the 21 contract 0.3.0 operations (task lifecycle, contributor rights, project-wide
  ranks, WIP limits with override, remaining work before done, one active sprint, frozen
  commitment, carry-over, burndown days, velocity range); work packages with tasks take their
  progress from them (`percentCompleteSource: TASKS`) — `src/app/mocks/work-domain.ts`,
  `src/app/mocks/handlers/{task,sprint}.handlers.ts`, demo data in `src/app/mocks/data-work.ts`
- API clients: `src/app/core/api/{tasks,sprints}.api.ts`
- Board tab: columns with WIP counts (at/over limit in words), CDK drag and drop limited to legal
  moves, a "Move" menu on every card, announcements, optimistic moves with snap-back, "move
  anyway" at a WIP limit, reason for Blocked, filters and swimlanes in the URL, column settings —
  `src/app/features/projects/workspace/board/`
- Task side sheet: edit (by whoever may change the task), Markdown description and comments,
  delete (managers) — `src/app/features/projects/workspace/work/`
- Backlog tab: active sprint (burndown with data table, close with carry-over), planned sprints
  (start, planned points against recent velocity), ranked backlog (drag or Move up/down,
  multi-select into a sprint), velocity chart with forecast range —
  `src/app/features/projects/workspace/backlog/`
- Shared: safe Markdown renderer (`shared/markdown/`), theme colours for charts
  (`shared/charts/`)
- Tests: 375 unit tests (≈ 92% statements), 92 e2e tests (desktop and 375 px, axe)

## Feature acceptance criteria covered (Phase 5)

- 08: dragging a card persists its status and order (e2e, drag then reload); a refused move
  snaps back with a message (unit); every drag action has a keyboard equivalent (unit + e2e);
  "two browsers see each other's moves within 1 s" needs live updates — Phase 9 (feature 18)
- 09: closing a sprint moves unfinished tasks as chosen and records completed points (unit +
  e2e); the burndown is recorded after every task change and daily (mock + API); backlog order
  persists and is keyboard-reorderable (unit + e2e)

## Phase 4 — what exists

- Mock API for all 32 contract 0.2.0 operations with the backend's rules (visibility 404s, edit
  rights, lifecycle map with 422 on a missing reason, health rule, charter approval authorizing
  the project, effort-weighted WBS roll-ups with exact decimal money, dashboard read model) —
  `src/app/mocks/projects-domain.ts`, `src/app/mocks/handlers/{portfolio,project,charter,wbs,dashboard}.handlers.ts`,
  demo data in `src/app/mocks/data-projects.ts`
- API clients: `src/app/core/api/{portfolios,projects,charter,wbs,dashboard}.api.ts`;
  permissions (UI only) in `src/app/core/auth/permissions.ts`; people and currency for pickers in
  `src/app/core/people/org-directory.ts`
- `/dashboard`: KPIs, health donut (lazy ECharts) and status bars with table alternatives, "needs
  attention" table worst-first; portfolio and health filters, sort and page in the URL —
  `src/app/features/dashboard/`
- `/portfolios`, `/portfolios/:id`: cards with objectives and counts; detail with projects grouped
  by program; create/edit/archive/reactivate/delete (empty only) portfolios, create/edit programs
  (PMO/admin) — `src/app/features/portfolios/`
- `/projects`: server-side filters (portfolio, status, methodology, health, search), sort and
  paging in the URL; `/projects/new` and `/projects/:id/edit` (methodology picker, end after
  start, budget in the org currency, 412 reload) — `src/app/features/projects/`
- Workspace `/projects/:id/*` with methodology-driven tabs: overview (details, lifecycle moves the
  API allows with reasons, health override, team), charter (read/print, edit with keyboard-operable
  form arrays, submit with missing-section list, approve/return by sponsor/PMO/admin, versions
  diff), WBS (accessible tree, roll-ups, add/edit/delete/move with keyboard and toolbar, undo);
  board/backlog/schedule say they come later — `src/app/features/projects/workspace/`
- Shared: health/status chips, money/percent/hours formatting and parsing, undo toasts,
  `QueryParams`, `uuidParam()` matcher, list styles (`shared/ui/data-table.scss`)
- Tests: 328 unit tests (≈ 93% statements), 80 e2e tests (desktop and 375 px, axe in light and dark)

## Feature acceptance criteria covered (Phase 4)

- 04: a PM creates an Agile project in a portfolio and sees it in the list (unit + e2e); illegal
  transitions impossible (only `allowedTransitions` offered; closed project shows none — unit +
  e2e; the mock enforces the map); viewer sees projects but no create/edit (unit + e2e); tabs
  depend on methodology (unit + e2e)
- 05: health follows the API's rule and the override is visible ("Off track (overridden)" with the
  reason — unit + e2e); charts have table alternatives; axe clean in both themes (e2e). "Loads
  under 1 s with 200 projects" is the API's read model; the UI makes two requests.
- 06: an approved charter can't be edited (no Edit; mock returns `charters.not_draft`); approving
  moves the project to APPROVED and records who/when (unit + e2e); form arrays keyboard-operable
  (unit + e2e)
- 07: moving a node renumbers the tree; moving under its own descendant can't be expressed in the
  UI (indent only targets the previous sibling deliverable) and the mock returns `wbs.cycle`;
  keyboard-usable tree announcing level and position (unit + e2e). Task-driven progress arrives
  with tasks (Phase 5).

## Phase 3 — what exists

- Public pages (auth layout): sign-in with demo buttons, register organization, forgot and reset
  password, accept invitation — `src/app/features/auth/`, `src/app/features/invitations/`
- Session lifecycle: restore on reload, return URL validation, expiry → sign-in, sign-out —
  `src/app/core/session/session.facade.ts`, `src/app/core/auth/`
- Guards: `guestGuard`, `authGuard`, `roleGuard` — `src/app/core/auth/auth.guards.ts`
- Toolbar: organization switcher, account menu; navigation filtered by role
- Administration (`/admin`, ORG_ADMIN): members (search, role filter, sort, paging, inline role,
  remove), invitations (status filter, invite dialog with role hints, revoke), organization settings
  (If-Match, 412 reload) — `src/app/features/admin/`
- Settings: profile card (name, preferred language saved to the account)
- Forms: `submitWithApi`, `FieldError`, `PasswordToggle`, focus on first invalid field —
  `src/app/shared/forms/`
- Tests: 222 unit tests (≈ 96% statements, many against the in-process mock API); 60 e2e tests on
  desktop and 375 px covering the feature 01/02/03/23 acceptance criteria and axe scans of every page

## Feature acceptance criteria covered

- 01: same message for wrong email/password (unit + e2e); reload keeps the session (e2e);
  parallel 401s → one refresh (unit); `returnUrl=https://evil.example` → dashboard (unit + e2e)
- 02: switching organization changes the tenant header and visible role (e2e); non-members get
  `tenant.forbidden` (mock tests)
- 03: viewer on `/admin/members` redirected with a message (e2e); inviting an existing member
  shows the error on the email field (unit + e2e); last-admin refusal shown with its message (unit)
- 23: theme/language persist (e2e); profile language applies after sign-in (unit)

## Mock mode cheat sheet

- Demo accounts (password `KoraDemo!2026`): one-click buttons on the sign-in page. The admin is
  also PMO in Virunga Build Partners.
- Invitation links: `/invitations/demo-invite-new-account-0001` (new account),
  `/invitations/demo-invite-existing-account-0002` (member@kora.demo joins Virunga),
  `/invitations/demo-invite-expired-account-0003` (expired).
- Reset links and new invitation links are printed to the browser console (they stand in for email).
- `window.koraMock.reset()` in the console restores the demo data.
- Phase 4 demo: PMO (`pmo@kora.demo`, French profile) is the sponsor of the "Data warehouse"
  charter awaiting approval; "Customer self-service portal" is late (amber); "ERP rollout" has an
  overridden red health; the portal and mobile app have WBS trees with progress.
- Phase 5 demo: the mobile app (`AKG-001`) runs Sprint 5 with "In progress" at its WIP limit, a
  blocked task and a task still in review with 2 h left; Sprint 6 is planned; Sprints 1–4 give
  velocity. The ERP's "Payables and receivables" work package takes its progress from its tasks.

## Contract with kora-api

Web types are generated from contract 0.6.0 (`kora-api/docs/openapi.yaml`); this build uses the
0.1.1 to 0.3.0 operations. All of 0.1.1–0.6.0 is live on the real API (0.3.0 since `api-v0.4.0`,
0.4.0 since `api-v0.5.0`, 0.5.0 since `api-v0.6.0`, 0.6.0 since `api-v0.7.0`). `npm run start:api` runs the app against the real API (needs Docker; it starts empty:
register an organization first; emails in Mailpit at http://localhost:8025). Mock mode stays the
default. Change requests go in `kora-api/docs/contract-requests.md` or to the API session directly.

## Decisions so far

- ADR 0001 — record decisions as ADRs
- ADR 0002 — monorepo, trunk-based commits on `main`, explicit paths, phase tags
- ADR 0003 — toolchain baseline (Angular 22.2, TS 6.0, Material, SignalStore, Transloco, MSW,
  Vitest, Playwright + axe, ESLint, Prettier)
- ADR 0004 — design system: Material 3 with `light-dark()` tokens, Transloco runtime i18n
- ADR 0005 — API layer: generated types, thin services, interceptor chain, MSW mock API
- ADR 0006 — sign-in, session lifecycle and administration screens
- ADR 0007 — portfolios, projects, dashboard, charter and WBS screens
- ADR 0008 — Kanban board, backlog and sprints
