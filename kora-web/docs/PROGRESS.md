# kora-web — progress

## Current status

Phase 1 complete (tag `web-v0.1.0`). Waiting for "continue".

## Next step

Phase 2 — API layer: typed client (generated once `kora-api/docs/openapi.yaml` exists), MSW mock
layer with the demo organizations, interceptor chain (correlation id → loading → error toast →
retry → auth → tenant), translated error messages, global error handler, dev proxy to the API.

## Checklist

- [x] 0. Scaffold, lint/format/commit hooks, unit + e2e test setup, CI (GitHub + GitLab), docs
- [x] 1. Design system and app shell
- [ ] 2. API client, mock layer (MSW), interceptors, error handling, dev proxy
- [ ] 3. Auth, org switcher, guards, admin users/roles/invitations, settings profile
- [ ] 4. Portfolio dashboard, projects, charter, WBS tree
- [ ] 5. Kanban, backlog, sprints
- [ ] 6. Gantt with dependencies and critical path
- [ ] 7. Risks + heat map, issues, stakeholders, change requests
- [ ] 8. Timesheets, resource heat map, EVM dashboard
- [ ] 9. Real-time notifications, activity feed, attachments, report exports
- [ ] 10. E2E flows, performance, Nginx Docker image, final README; tag v1.0.0

## Phase 1 — what exists

- Material 3 theme (light / dark / system, high contrast, strong focus rings, reduced motion) and
  Kora status tokens — `src/styles.scss`, `src/styles/`
- App shell: skip link, toolbar with theme and language menus, responsive side navigation
  (drawer below 960 px), focus moved to the page heading after navigation — `src/app/core/layout/`
- i18n: Transloco, en / fr / rw, translated page titles, `<html lang>`, parity test —
  `src/app/core/i18n/`, `public/i18n/`
- Shared UI: page header, empty / error / loading states, status chip, confirm dialog —
  `src/app/shared/ui/`
- Pages: dashboard placeholder, settings (Appearance, About), not found
- Tests: 63 unit tests (≈ 99% statements); 22 e2e tests on desktop and 375 px, including axe
  scans in light, dark and high-contrast modes and the feature 23 persistence criteria

## Contract with kora-api

Contract 0.1.0 shapes are agreed with the API side (auth, organization, /me, members, invitations);
`kora-api/docs/openapi.yaml` is written in API Phase 1. Until then the web app's types live in
`src/app/core/api/api.models.ts`, and the app runs against MSW.

## Decisions so far

- ADR 0001 — record decisions as ADRs
- ADR 0002 — monorepo, trunk-based commits on `main`, explicit paths, phase tags
- ADR 0003 — toolchain baseline (Angular 22.2, TS 6.0, Material, SignalStore, Transloco, MSW,
  Vitest, Playwright + axe, ESLint, Prettier)
- ADR 0004 — design system: Material 3 with `light-dark()` tokens, Transloco runtime i18n
