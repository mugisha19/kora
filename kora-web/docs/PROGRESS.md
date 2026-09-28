# kora-web — progress

## Current status

Phase 9 complete (tag `web-v0.9.0`). Waiting for "continue".

## Next step

Phase 10 — end-to-end flows, performance, the Nginx Docker image (proxying `/api` and `/ws` to
`api:8080`, published on 4200), the root compose include and the final README; tag v1.0.0 as the
user decides. The API is complete (`api-v1.0.0`, contract 0.8.0 final).

## Checklist

- [x] 0. Scaffold, lint/format/commit hooks, unit + e2e test setup, CI (GitHub + GitLab), docs
- [x] 1. Design system and app shell
- [x] 2. API client, mock layer (MSW), interceptors, error handling, dev proxy
- [x] 3. Auth, org switcher, guards, admin users/roles/invitations, settings profile
- [x] 4. Portfolio dashboard, projects, charter, WBS tree
- [x] 5. Kanban, backlog, sprints
- [x] 6. Gantt with dependencies and critical path
- [x] 7. Risks + heat map, issues, stakeholders, change requests
- [x] 8. Timesheets, resource heat map, EVM dashboard
- [x] 9. Real-time notifications, activity feed, attachments, report exports
- [ ] 10. E2E flows, performance, Nginx Docker image, final README; tag v1.0.0

## Phase 9 — what exists

- Mock API for contracts 0.7.0 and 0.8.0: notifications and preferences, activity, history, the
  audit log and its hash-chain check, attachments with a presigned-style object store that sniffs
  content, report jobs; an outbox that records audit, activity and notifications after every
  change (and denied requests) and an in-page STOMP-like broker — `mocks/{outbox,broker,audit-chain,respond}.ts`,
  `handlers/{activity,attachment,report}.handlers.ts`, demo data in `data-activity.ts`
- API clients: `core/api/{notifications,audit,attachments,reports}.api.ts`; `/me/*` sent without
  the organization header
- Live updates: `core/live/` (STOMP transport with backoff, mock broker transport, `LiveUpdates`),
  offline banner in the shell, `/ws` in the dev proxy
- Notifications: toolbar bell with unread count, notification center side sheet (by day, mark
  read, all read, links), polite announcements, preferences in Settings — `core/notifications/`,
  `features/settings/notification-preferences-card.ts`
- Workspace: Activity tab (live), change history under tasks, risks, issues, change requests and
  the project, files panel on the same items, task links `/tasks/<id>` opening over the board or
  schedule, live refresh of board, backlog, schedule and registers — `workspace/{activity,history,attachments,work/task-routes.ts,live-refresh.ts}`
- Reports: export menu on the dashboard, overview, risks, earned value and time tabs; `/reports`
  with the job list, fresh download links and a ready toast — `features/reports/`, `core/reports/`
- Admin → Audit log: filters in the URL, field-level details, chain check, CSV export —
  `features/admin/audit/`
- ADR 0012
- Checked against the live API (`api-v1.0.0`): notifications and their params, STOMP delivery
  through the dev proxy, activity and attachments. Browser uploads to SeaweedFS need the web's
  origin in the storage CORS rule (4200 by default)
- Tests: 567 unit tests (≈ 88% statements), 136 e2e tests (desktop and 375 px, axe), including
  live notifications and the offline banner, uploads, report downloads and the audit log

## Feature acceptance criteria covered (Phase 9)

- 18: a rolled-back change produces no notification (the API's outbox; the mock records only
  successful responses — mock tests); users can't subscribe to projects they don't belong to
  (broker + mock tests); reconnecting after a lost network resumes updates without a reload (unit
  - e2e)
- 19: mutating requests produce audit events and denied requests are recorded (mock + unit +
  e2e); rows can't be changed without breaking the chain check (mock + unit)
- 20: a renamed .exe uploaded as .pdf is refused (mock + unit); files from another
  organization can't be downloaded (mock); upload works from the keyboard and shows progress (unit
  - e2e)
- 21: reports are made in the background and downloaded through fresh links (mock + unit + e2e);
  at most five wait at once (mock + unit); CSV exports neutralize formulas (unit)

## Phase 8 — what exists

- Mock API for the contract 0.6.0 operations: timesheets (week, entries, submit, approve, send
  back, project list), cost rates, capacity and leave, allocations, the heat map, public holidays,
  EVM report, series and settings, dashboard trends; EVM in exact BigInt money
  (`mocks/evm.ts`), the health rule reads SPI and CPI — `mocks/{time,evm}-domain.ts`,
  `handlers/{timesheet,resource}.handlers.ts`, demo data in `data-time.ts`
- API clients: `core/api/{timesheets,resources,evm}.api.ts`; ISO-week helpers and `OrgClock`
- `/timesheets` (and `/timesheets/2026-W40`): tasks × days grid, keyboard navigation, autosave,
  quarter-hour and 24-hour checks, copy last week, add task, submit, sent-back notices —
  `features/timesheets/`
- `/resources`: utilization heat map with bands in words, start/weeks/team in the URL, a person's
  sheet with capacity, leave and (PMO/admin) cost rates — `features/resources/`
- Workspace Time tab: approvals (long-week flag, own time to the PMO, send back with a comment)
  and planned hours with a what-if utilization preview — `workspace/time/`
- Workspace Earned value tab: SPI/CPI gauges with zones, figures with explanations or the reason
  they are missing, S-curve with a data table, method settings with `If-Match` — `workspace/evm/`
- Dashboard: SPI/CPI KPI and the portfolio's monthly trend; Admin → Calendar adds Rwanda's public
  holidays for a year
- ADR 0011
- Fixed along the way: the timesheet week route's pattern had lost its backslashes (week links
  would not have matched); planned hours used the day's 0–24 parser and showed every saved week
  as changed
- Tests: 516 unit tests (≈ 89% statements), 126 e2e tests (desktop and 375 px, axe), including
  the member's week from the keyboard, approvals, planned hours, the heat map and earned value

## Feature acceptance criteria covered (Phase 8)

- 15: a day over 24 hours is refused (store + unit + e2e); submitted and approved weeks are
  read-only (unit + e2e); managers approve or send back with a comment, never their own time
  (mock + unit + e2e); entry is keyboard-first (unit + e2e)
- 16: capacity counts holidays and leave (mock + unit); over- and under-allocation are shown in
  words (unit + e2e); planned-hours changes preview utilization before saving (unit + e2e)
- 17: EVM figures match the textbook formulas (mock unit tests); the S-curve has a data table
  (unit + e2e); methods are chosen per project and the report names them (unit); SPI/CPI feed
  health and the dashboard trend (mock + unit)

## Phase 7 — what exists

- Mock API for the 35 contract 0.5.0 operations: risks (scoring, bands, strategies by kind,
  assessments, close, materialize into an issue, heat map, portfolio view), issues (lifecycle,
  overdue, escalated), stakeholders (grid, gap, anonymizing removal), change requests (the
  approval chain from the organization's thresholds, no self-approval, decisions, withdraw,
  implement, revise, the inbox) and the change-control settings; the last approval changes the
  budget, target end date, charter and schedule baseline; the health rule includes critical
  risks — `src/app/mocks/governance-domain.ts`, `handlers/{risk,issue,stakeholder,change-request}.handlers.ts`,
  demo data in `data-governance.ts`
- API clients: `src/app/core/api/{risks,issues,stakeholders,change-requests}.api.ts`; types
  regenerated for contracts 0.7.0 and 0.8.0
- Risks tab: heat map (a table of toggle buttons, count and band in words) filtering the register,
  guided scoring, strategies by kind, the risk sheet at `/risks/<id>` with assessment history,
  re-assess, close, "it happened" — `workspace/risks/`
- Issues tab: quick filters (mine, overdue, critical), escalated and overdue marks, the issue sheet
  at `/issues/<id>` (start, resolve with a resolution, close, reopen, raise a change request) —
  `workspace/issues/`
- Stakeholders tab: power/interest grid, engagement matrix, register, gap and quadrant filters,
  read-only view for non-managers, removal that erases personal data — `workspace/stakeholders/`
- Changes tab and page: list, impact, approval timeline, approve/reject (comment required to
  reject), submit, withdraw, implement, revise — `workspace/changes/`
- "My approvals": toolbar badge and `/approvals` — `core/approvals/`, `features/approvals/`
- Admin → Change control thresholds with `If-Match`; dashboard: open critical risks, pending
  change requests and a list of critical risks
- ADR 0010
- Fixed along the way: demo data is dated in Kigali time (the seed used UTC dates, so tests
  failed between midnight and 02:00 in Kigali), and the schedule e2e no longer hardcodes the
  finish date (the demo dates move with today)
- Tests: 457 unit tests (≈ 90% statements), 116 e2e tests (desktop and 375 px, axe), including
  every governance tab and the PMO's approvals end to end

## Feature acceptance criteria covered (Phase 7)

- 11: heat map counts match the register filters (the cell filters the register to its ids —
  unit + e2e); strategies depend on threat vs opportunity (mock + unit); "overdue review notifies
  the owner" is the API's job (Phase 8 events) — the register marks overdue reviews
- 12: materializing a risk creates a linked issue in one step (mock, unit, e2e); overdue critical
  issues are marked escalated (mock + unit + e2e); a resolution is required and shown (unit + e2e)
- 13: quadrants follow the power/interest rule and are keyboard-reachable (mock, unit, e2e); the
  gap filter lists only current < desired (mock + unit); removal erases personal fields (mock +
  unit)
- 14: a small change needs only the PM, a large one PM → PMO → sponsor (mock + unit + e2e);
  approving updates budget, end date, charter and baseline together (mock + unit + e2e); nobody
  approves their own request (mock + unit)

## Phase 6 — what exists

- Mock API for the 7 contract 0.4.0 operations: dependencies (same project, no self-links, no
  duplicates, loops refused with the chain), the CPM schedule on working days (four link types,
  lags and leads, start-no-earlier-than, total and free float, baseline variance), baselines, and
  the working calendar with `If-Match` — `src/app/mocks/cpm.ts` (pure CPM),
  `schedule-domain.ts`, `handlers/schedule.handlers.ts`, demo network in `data-schedule.ts`
  (Data warehouse, AKG-005: 8 tasks, 10 links, baseline 1 with a 4-day slip)
- API client: `src/app/core/api/schedule.api.ts`; types regenerated for contract 0.7.0
- Schedule tab (Predictive and Hybrid): custom SVG Gantt (bars, milestones, dependency arrows,
  hatched and labelled critical path, baseline bars, today line, shaded non-working days,
  day/week/month zoom), drag to move (start-no-earlier-than), resize (duration) and link (FS),
  loop chain shown; table view with every figure and every edit (duration and constraint dialog,
  add predecessor with type and lag, remove link); save baseline — ADR 0009,
  `src/app/features/projects/workspace/schedule/`
- Task side sheet: duration and constraint on Predictive and Hybrid projects
- Admin → Working calendar: working days, holidays, `If-Match` and 412 —
  `src/app/features/admin/calendar/`
- Tests: 408 unit tests (≈ 91.5% statements), 102 e2e tests (desktop and 375 px, axe), including
  the Gantt (drag and link on desktop), table edits and the working calendar

## Feature acceptance criteria covered (Phase 6)

- 10: CPM matches a textbook network (mock unit test with known ES/EF/LS/LF and floats); a cycle
  is refused with the tasks named (mock, unit and e2e); the critical path is hatched and labelled,
  not only coloured, and the table view offers every edit (unit + e2e)

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

Web types are generated from contract 0.8.0 (`kora-api/docs/openapi.yaml`); this build uses the
0.1.1 to 0.8.0 operations (all of them). All of 0.1.1–0.8.0 is live on the real API (0.3.0 since `api-v0.4.0`,
0.4.0 since `api-v0.5.0`, 0.5.0 since `api-v0.6.0`, 0.6.0 since `api-v0.7.0`, 0.7.0 since
`api-v0.8.0`, 0.8.0 since `api-v0.9.0`). `npm run start:api` runs the app against the real API (needs Docker; it starts empty:
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
- ADR 0009 — Gantt schedule and working calendar
- ADR 0010 — risks, issues, stakeholders and change control
- ADR 0011 — timesheets, resources and earned value
- ADR 0012 — live updates, audit trail, attachments and report exports
