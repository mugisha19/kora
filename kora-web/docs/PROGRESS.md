# kora-web — progress

## Current status

Phase 2 complete (tag `web-v0.2.0`). Waiting for "continue".

## Next step

Phase 3 — auth and administration: sign-in, register organization, forgot/reset password, session
restore on reload, route guards (guest, auth, role), session-expiry handling, organization switcher,
admin area (members, invitations, organization settings), accept-invitation page, profile card.

## Checklist

- [x] 0. Scaffold, lint/format/commit hooks, unit + e2e test setup, CI (GitHub + GitLab), docs
- [x] 1. Design system and app shell
- [x] 2. API client, mock layer (MSW), interceptors, error handling, dev proxy
- [ ] 3. Auth, org switcher, guards, admin users/roles/invitations, settings profile
- [ ] 4. Portfolio dashboard, projects, charter, WBS tree
- [ ] 5. Kanban, backlog, sprints
- [ ] 6. Gantt with dependencies and critical path
- [ ] 7. Risks + heat map, issues, stakeholders, change requests
- [ ] 8. Timesheets, resource heat map, EVM dashboard
- [ ] 9. Real-time notifications, activity feed, attachments, report exports
- [ ] 10. E2E flows, performance, Nginx Docker image, final README; tag v1.0.0

## Phase 2 — what exists

- Types generated from contract 0.1.0 (`npm run api:generate`), checked in CI (`npm run api:check`)
  — `src/app/core/api/generated/`, friendly names in `api.models.ts`
- Thin API services per contract tag — `src/app/core/api/*.api.ts`
- Session store (token in memory, active organization) and single-flight refresh —
  `src/app/core/session/`
- Interceptor chain: correlation id → loading → error toast → retry → auth → tenant —
  `src/app/core/http/interceptors.ts`; progress bar in the shell
- Error handling: `toApiError`, `ErrorMessages` (translated by code and params, en/fr/rw),
  `serverErrors()` for Signal Forms, `Notifier` toasts, `GlobalErrorHandler` — `src/app/core/errors/`
- MSW mock API for every 0.1.0 operation with the contract's rules, demo data from feature 22 —
  `src/app/mocks/`; dev proxy to the real API with `npm run start:api`
- Tests: 130 unit tests (≈ 99% statements) including 24 mock-API contract tests; 26 e2e tests

## Mock mode cheat sheet

- Demo accounts (password `KoraDemo!2026`): `admin@`, `pmo@`, `pm@`, `member@`, `viewer@kora.demo`.
  The admin is also PMO in Virunga Build Partners.
- Invitation links: `/invitations/demo-invite-new-account-0001` (new account),
  `/invitations/demo-invite-existing-account-0002` (member@kora.demo joins Virunga),
  `/invitations/demo-invite-expired-account-0003` (expired).
- Reset links and new invitation links are printed to the browser console (they stand in for email).
- `window.koraMock.reset()` in the console restores the demo data.

## Contract with kora-api

Contract 0.1.0 (tag `api-v0.1.0`) at `kora-api/docs/openapi.yaml`. The real endpoints arrive in API
Phase 2; until then the app runs against MSW. Change requests go in
`kora-api/docs/contract-requests.md` or to the API session directly.

## Decisions so far

- ADR 0001 — record decisions as ADRs
- ADR 0002 — monorepo, trunk-based commits on `main`, explicit paths, phase tags
- ADR 0003 — toolchain baseline (Angular 22.2, TS 6.0, Material, SignalStore, Transloco, MSW,
  Vitest, Playwright + axe, ESLint, Prettier)
- ADR 0004 — design system: Material 3 with `light-dark()` tokens, Transloco runtime i18n
- ADR 0005 — API layer: generated types, thin services, interceptor chain, MSW mock API
