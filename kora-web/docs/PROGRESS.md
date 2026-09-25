# kora-web — progress

## Current status

Phase 0 complete (tag `web-v0.0.1`). Waiting for "continue".

## Next step

Phase 1 — design system and app shell: Material theme (light/dark/high contrast), layout and
navigation, i18n setup (en, fr, rw) with a parity test, accessibility foundations, reusable UI components.

## Checklist

- [x] 0. Scaffold, lint/format/commit hooks, unit + e2e test setup, CI (GitHub + GitLab), docs
- [ ] 1. Design system and app shell
- [ ] 2. API client, mock layer (MSW), interceptors, error handling, dev proxy
- [ ] 3. Auth, org switcher, guards, admin users/roles/invitations, settings
- [ ] 4. Portfolio dashboard, projects, charter, WBS tree
- [ ] 5. Kanban, backlog, sprints
- [ ] 6. Gantt with dependencies and critical path
- [ ] 7. Risks + heat map, issues, stakeholders, change requests
- [ ] 8. Timesheets, resource heat map, EVM dashboard
- [ ] 9. Real-time notifications, activity feed, attachments, report exports
- [ ] 10. E2E flows, performance, Nginx Docker image, final README; tag v1.0.0

## Contract with kora-api

Contract 0.1.0 shapes are agreed with the API side (auth, organization, /me, members, invitations);
`kora-api/docs/openapi.yaml` is written in API Phase 1. Until then the web app's types live in
`src/app/core/api/api.models.ts`, and the app runs against MSW.

## Decisions so far

- ADR 0001 — record decisions as ADRs
- ADR 0002 — monorepo, trunk-based commits on `main`, explicit paths, phase tags
- ADR 0003 — toolchain baseline (Angular 22.2, TS 6.0, Material, SignalStore, Transloco, MSW,
  Vitest, Playwright + axe, ESLint, Prettier)
