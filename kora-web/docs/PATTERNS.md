# Design patterns in kora-web

Patterns are used only where they solve a real problem. Each row is filled in when the pattern
actually lands in code, with file paths, and a pattern that doesn't earn its place is rejected in an ADR.

| Pattern                                     | Problem it solves in Kora                                                                     | Status                  | Where                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------- |
| Smart vs presentational components          | Keep data access out of reusable UI so it can be tested with plain inputs                     | Done — Phase 1          | `src/app/shared/ui/*` (presentational), feature pages |
| Strategy (framework hook)                   | Change how the router sets the document title without touching any route                      | Done — Phase 1          | `src/app/core/i18n/translated-title.strategy.ts`      |
| Observer                                    | Language changes re-translate titles; later, real-time STOMP updates                          | Started — Phase 1       | `TranslatedTitleStrategy`; Phase 9 for STOMP          |
| Facade per feature                          | Components talk to one API; store and HTTP details can change behind it                       | Planned — Phase 2       | —                                                     |
| Chain of Responsibility (HTTP interceptors) | Correlation id, loading, error toast, retry, auth refresh, tenant header as independent links | Planned — Phase 2       | —                                                     |
| Adapter / Mapper                            | API errors of any shape → one `ApiError`; DTOs → view models                                  | Started — Phase 0       | `src/app/core/api/api-error.ts`                       |
| Composite                                   | WBS tree where a node and a subtree render and roll up the same way                           | Planned — Phase 4       | —                                                     |
| State                                       | Only legal lifecycle transitions offered in the UI (project, charter, task, change request)   | Planned — Phases 4–7    | —                                                     |
| Strategy (domain)                           | Methodology-specific tabs and rules (Agile, Predictive, Hybrid); export formats               | Planned — Phases 4–6, 9 | —                                                     |
| Guards and resolvers                        | Role- and tenant-aware routing (the UI hides; the API enforces)                               | Planned — Phase 3       | —                                                     |

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
