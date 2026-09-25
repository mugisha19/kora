# Design patterns in kora-web

Patterns are used only where they solve a real problem. Each row is filled in when the pattern
actually lands in code, with file paths, and a pattern that doesn't earn its place is rejected in an ADR.

| Pattern                                     | Problem it solves in Kora                                                                     | Status                  | Where                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------- |
| Smart vs presentational components          | Keep data access out of reusable UI so it can be tested with plain inputs                     | Planned — Phase 1       | —                               |
| Facade per feature                          | Components talk to one API; store and HTTP details can change behind it                       | Planned — Phase 2       | —                               |
| Chain of Responsibility (HTTP interceptors) | Correlation id, loading, error toast, retry, auth refresh, tenant header as independent links | Planned — Phase 2       | —                               |
| Adapter / Mapper                            | API errors of any shape → one `ApiError`; DTOs → view models                                  | Started — Phase 0       | `src/app/core/api/api-error.ts` |
| Composite                                   | WBS tree where a node and a subtree render and roll up the same way                           | Planned — Phase 4       | —                               |
| State                                       | Only legal lifecycle transitions offered in the UI (project, charter, task, change request)   | Planned — Phases 4–7    | —                               |
| Strategy                                    | Methodology-specific tabs and rules (Agile, Predictive, Hybrid); export formats               | Planned — Phases 4–6, 9 | —                               |
| Observer                                    | Signals and RxJS streams for real-time STOMP updates                                          | Planned — Phase 9       | —                               |
| Guards and resolvers                        | Role- and tenant-aware routing (the UI hides; the API enforces)                               | Planned — Phase 3       | —                               |

## Phase 0

Phase 0 is tooling. The structural rule already enforced is **OnPush everywhere** (ESLint
`prefer-on-push-component-change-detection`). The one piece of application code is the error
**adapter** `toApiError()`, which turns any `HttpErrorResponse` (Problem Details, an HTML page from a
proxy, a network failure) into a single `ApiError` shape, so later layers never inspect raw HTTP errors.
