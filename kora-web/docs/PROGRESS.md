# kora-web — progress

## Current status

Phase 3 complete (tag `web-v0.3.0`). Waiting for "continue".

## Next step

Phase 4 — portfolio dashboard, portfolios/programs/projects (list, create, workspace with
methodology-driven tabs, lifecycle transitions), project charter (form arrays, versions), WBS tree.
Contract 0.2.0 (32 operations) is committed; the API implements them in API Phase 3, so Phase 4
starts on MSW.

## Checklist

- [x] 0. Scaffold, lint/format/commit hooks, unit + e2e test setup, CI (GitHub + GitLab), docs
- [x] 1. Design system and app shell
- [x] 2. API client, mock layer (MSW), interceptors, error handling, dev proxy
- [x] 3. Auth, org switcher, guards, admin users/roles/invitations, settings profile
- [ ] 4. Portfolio dashboard, projects, charter, WBS tree
- [ ] 5. Kanban, backlog, sprints
- [ ] 6. Gantt with dependencies and critical path
- [ ] 7. Risks + heat map, issues, stakeholders, change requests
- [ ] 8. Timesheets, resource heat map, EVM dashboard
- [ ] 9. Real-time notifications, activity feed, attachments, report exports
- [ ] 10. E2E flows, performance, Nginx Docker image, final README; tag v1.0.0

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

## Contract with kora-api

Contract 0.2.0 at `kora-api/docs/openapi.yaml` (0.1.1 operations live on the real API; 0.2.0 in API
Phase 3). `npm run start:api` runs the app against the real API (needs Docker; it starts empty:
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
