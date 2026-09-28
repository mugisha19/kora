# Design patterns in kora-web

Patterns are used only where they solve a real problem. Each row is filled in when the pattern
actually lands in code, with file paths, and a pattern that doesn't earn its place is rejected in an ADR.

| Pattern                                     | Problem it solves in Kora                                                                     | Status                  | Where                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| Smart vs presentational components          | Keep data access out of reusable UI so it can be tested with plain inputs                     | Done — Phase 1          | `src/app/shared/ui/*` (presentational), feature pages            |
| Strategy (framework hook)                   | Change how the router sets the document title without touching any route                      | Done — Phase 1          | `src/app/core/i18n/translated-title.strategy.ts`                 |
| Observer                                    | Language changes re-translate titles; later, real-time STOMP updates                          | Started — Phase 1       | `TranslatedTitleStrategy`; Phase 9 for STOMP                     |
| Facade per feature                          | Components talk to one API; store and HTTP details can change behind it                       | Done — Phase 3          | `core/session/session.facade.ts`, `features/auth/auth.facade.ts` |
| Chain of Responsibility (HTTP interceptors) | Correlation id, loading, error toast, retry, auth refresh, tenant header as independent links | Done — Phase 2          | `src/app/core/http/interceptors.ts`                              |
| Adapter / Mapper                            | API errors of any shape → one `ApiError`; server field errors → Signal Forms errors           | Done — Phase 2          | `core/api/api-error.ts`, `core/errors/server-errors.ts`          |
| Composite                                   | WBS tree where a node and a subtree render and roll up the same way                           | Planned — Phase 4       | —                                                                |
| State                                       | Only legal lifecycle transitions offered in the UI (project, charter, task, change request)   | Planned — Phases 4–7    | —                                                                |
| Strategy (domain)                           | Methodology-specific tabs and rules (Agile, Predictive, Hybrid); export formats               | Planned — Phases 4–6, 9 | —                                                                |
| Guards                                      | Role- and session-aware routing (the UI hides; the API enforces)                              | Done — Phase 3          | `src/app/core/auth/auth.guards.ts`                               |
| Route-scoped store                          | Admin list state lives only while its page is open; query drives server-side reloads          | Done — Phase 3          | `features/admin/*/*.store.ts`                                    |
| Template helper (one submit path)           | Every form validates, calls the API and places errors the same way                            | Done — Phase 3          | `src/app/shared/forms/form-helpers.ts`                           |
| Single-flight (shared in-flight request)    | Parallel 401s trigger one token refresh, not ten competing rotations                          | Done — Phase 2          | `src/app/core/session/session-refresher.ts`                      |
| Store (NgRx SignalStore)                    | One reactive source of truth for the session: token, user, active organization                | Done — Phase 2          | `src/app/core/session/session.store.ts`                          |

## Phase 0

Phase 0 is tooling. The structural rule already enforced is **OnPush everywhere** (ESLint
`prefer-on-push-component-change-detection`). The one piece of application code is the error
**adapter** `toApiError()`, which turns any `HttpErrorResponse` (Problem Details, an HTML page from a
proxy, a network failure) into a single `ApiError` shape, so later layers never inspect raw HTTP errors.

## Phase 1

- **Smart vs presentational.** Everything in `shared/ui` (`PageHeader`, `EmptyState`, `ErrorState`,
  `LoadingState`, `StatusChip`, `ConfirmDialog`) takes only inputs and emits outputs; none injects a
  store or `HttpClient`. Pages in `features/` own data and state. Shared UI tests render components
  with plain inputs and only i18n/icon providers.
- **Strategy via a framework hook.** Angular's `TitleStrategy` is a strategy slot: providing
  `TranslatedTitleStrategy` changes how every route title is rendered (translated, suffixed with
  "· Kora", re-translated on language change) without any route knowing about it.
- **Observer.** The title strategy subscribes to Transloco's translation stream with `switchMap`,
  so a language change pushes a new title. Theme and language live in signals that the shell and
  the settings page read.

## Phase 2

- **Chain of Responsibility.** Six functional interceptors, each with one job and no knowledge of
  the others; `API_INTERCEPTORS` fixes their order (see ADR 0005 for why the order matters).
- **Adapter.** `toApiError()` and `serverErrors()` convert wire formats into what the UI works with,
  so components never see `HttpErrorResponse` or Problem Details.
- **Single-flight.** `SessionRefresher` shares one in-flight refresh (`shareReplay`) between all
  callers and clears it when settled.
- **Store.** `SessionStore` (SignalStore) holds session state; `withComputed` derives the active
  membership and role; `withMethods` are the only way to change it.
- **Dependency injection for time.** `NOW` is an injection token, so expiry logic is tested by
  moving a number instead of faking timers.

## Phase 3

- **Facade.** `SessionFacade` is the only way components start, restore, switch, expire or end a
  session; `AuthFacade` wraps the public auth calls. Pages never touch `SessionStore` writes or
  `AuthApi` directly, so the lifecycle rules (safe return URL, profile language, announcements)
  live in one place.
- **Guards.** `authGuard`, `guestGuard` and the factory `roleGuard(...roles)` return `UrlTree`s
  (redirects) instead of `false`, so users always land somewhere meaningful.
- **Route-scoped store.** `MembersStore` and `InvitationsStore` are in their page's `providers`,
  with `withHooks.onInit` connecting the query signal to an `rxMethod` loader.
- **One submit path.** `submitWithApi()` is the shared algorithm every form follows; pages only
  supply the action and, optionally, a handler for a special error (412, expired link).

## Phase 4

- **State (server-side), rendered.** The lifecycle State pattern lives in the API; the UI offers
  exactly `project.allowedTransitions` and asks for a reason where the contract needs one, so it
  can't express an illegal move.
- **Strategy.** `METHODOLOGY_STRATEGIES` maps a methodology to its workspace tabs; nothing else
  branches on the methodology.
- **Composite.** `WbsTreeNode` renders a node and, recursively, its children — the screen mirrors
  the API's `WbsComponent`. Roll-ups stay on the server.
- **Facade.** `PortfolioFacade` opens the dialogs, calls the API and announces results for the
  portfolio pages; stores (`ProjectStore`, `CharterStore`, `WbsStore`) are the facades of the
  workspace tabs.
- **Command with undo.** WBS moves and deletes run, then offer "Undo" (`Notifier.undoable`); undo
  is the inverse command (move back, re-create the subtree).
- **URL as state.** List filters, sort and page are query parameters bound to inputs and changed
  through `QueryParams`; the store just reacts to the resulting query signal.
- **Progressive enhancement for charts.** Data first (a table), chart second (lazy, decorative,
  patterned).

## Phase 5

- **State (server-side), mirrored for affordances.** `TASK_NEXT` decides which columns accept a
  dropped card and which "Move to…" items appear; the API enforces the same state machine.
- **Entity adapter.** `BoardStore` keeps tasks with `withEntities` and derives the columns,
  swimlanes and filters with `withComputed`.
- **Optimistic update with rollback.** Place the card, call `/move`, reload: success shows the
  server's rank and counts, refusal shows the card where it was.
- **Facade shared by two tabs.** `TaskFacade` (side sheet, rights, moves with their dialogs) is
  provided by both the board and the backlog.
- **Interpreter.** The Markdown renderer parses text into blocks and inline pieces and renders them
  with templates — the data never becomes markup.

## Phase 6

- **Strategy (server-side).** The API's `SchedulingStrategy` computes the schedule; the UI only
  draws it, so a different algorithm needs no UI change. The mock mirrors it in pure functions
  (`mocks/cpm.ts`).
- **Pure core, thin component.** `gantt-geometry.ts` holds every calculation (positions, ticks,
  bars, arrows, working days) as pure functions; `GanttChart` maps them to SVG and turns pointer
  gestures into three outputs (moved, resized, linked).
- **Two views, one store.** The Gantt and the table read the same `ScheduleStore`; the tab turns
  both views' outputs into the same commands.
- **Parameter object for errors.** A `schedule.cycle` error carries its chain in
  `errors[0].params`; `loopOf()` adapts it for every place that shows it.
- **Local edit, one save.** The working calendar edits days and holidays locally, then saves them
  together with `If-Match` (412 → reload the other version).

## Phase 7

- **Chain of Responsibility (server-side), rendered.** The API builds the approval chain from
  handlers (project manager, PMO, sponsor); the UI draws the steps it returns as a timeline and
  never recomputes who should approve. The mock mirrors the handlers in `chainFor()`.
- **State (server-side).** Issue and change-request lifecycles live in the API; the sheet and page
  offer only the moves the status allows and show `…invalid_transition` refusals.
- **Facade + `resource()`.** A facade per tab runs commands and bumps a `version` signal; reads
  are `resource()`s keyed on it — lighter than a store when a tab has no client-side state to
  merge.
- **Routed side sheet.** `routeSheet()` ties a dialog to a child route: the URL opens it, closing
  it navigates back, leaving the route closes it.
- **Specification (server-side), in the URL.** Register filters (kind, category, owner, status,
  overdue, gap, quadrant, heat map cell) are query parameters mapped to API filters.

## Phase 8

- **Debounced autosave with a local draft.** `TimesheetStore` keeps the grid as text, validates it
  on every keystroke and saves 800 ms after the last change; an invalid cell blocks the save and
  keeps what was typed — `features/timesheets/timesheet.store.ts`.
- **What-if preview.** Planned hours are a `linkedSignal` draft over the saved allocations; each
  cell's utilization is recomputed from the heat map (all projects) minus the saved hours plus the
  draft, so a manager sees the effect before saving — `workspace/time/time-tab.ts`.
- **Strategy (server-side), chosen in the UI.** Percent-complete (physical, 0/100, 50/50, story
  points) and EAC (typical, atypical, composite) methods are strategies the API applies; the tab
  only picks one per project and the mock mirrors them in `mocks/evm.ts`.
- **Value object for time.** ISO weeks and org-local dates are strings with pure helpers
  (`shared/format/iso-week.ts`, `core/session/org-clock.ts`), never `Date` objects that shift
  with the browser's time zone.
