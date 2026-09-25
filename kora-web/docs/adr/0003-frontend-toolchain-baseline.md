# 0003 — Front-end toolchain baseline

- Status: Accepted
- Date: 2026-09-25

## Context

The toolchain decides how fast feedback is and how strict the codebase stays as it grows. All
versions were checked against the npm registry on 2026-09-25 rather than taken from memory.

## Decision

| Concern    | Choice                                                                     | Version       |
| ---------- | -------------------------------------------------------------------------- | ------------- |
| Framework  | Angular (standalone, zoneless, OnPush by default)                          | 22.2          |
| Language   | TypeScript, `strict` + `strictTemplates` + extended diagnostics as errors  | 6.0.x         |
| Runtime    | Node.js LTS                                                                | 24 (`.nvmrc`) |
| UI kit     | Angular Material 3 + CDK                                                   | 22.2          |
| State      | NgRx SignalStore                                                           | 22.0          |
| i18n       | Transloco (runtime language switch: en, fr, rw)                            | 8.4           |
| API mocks  | MSW (Mock Service Worker)                                                  | 2.15          |
| Unit tests | Vitest via `@angular/build:unit-test`, jsdom, v8 coverage, Testing Library | 5.0 / 19.5    |
| E2E        | Playwright (desktop Chrome + 375 px mobile) with axe WCAG 2.1 AA scans     | 1.63 / 4.13   |
| Lint       | ESLint flat config + angular-eslint + typescript-eslint `strict`           | 10 / 22.5     |
| Format     | Prettier, with eslint-config-prettier to avoid rule fights                 | 3.9           |
| Git hooks  | Husky + lint-staged + commitlint                                           | 9 / 17 / 21   |

Notable points:

- **TypeScript is pinned to 6.0.x.** Angular 22.2's compiler declares `typescript >=6.0 <6.1` as a
  peer dependency. `openapi-typescript` 7.13 still declares a TypeScript 5 peer, so the client
  generator will run through `npx` in Phase 2 instead of being installed.
- **Zoneless + OnPush are the Angular 22 defaults.** ESLint additionally fails on any component that
  opts back into eager change detection.
- **Signal Forms** (`@angular/forms/signals`, stable in 22) for new forms: Material 22's `matInput`
  and `mat-select` read error state from the `[formField]` directive directly.
- **Three build configurations:** `mock` (default for `npm start`; the API is served by MSW in the
  browser), `development` (`npm run start:api`; `/api` proxied to the API on `localhost:8080`, see
  `proxy.conf.json`) and `production`. The dev proxy keeps the app and API same-origin, so the
  `SameSite=Strict` refresh cookie works without CORS.
- **Icons are self-hosted SVGs.** `scripts/copy-icons.mjs` copies only the Material Symbols the app
  uses into `public/icons`, instead of loading the icon font from Google (blocked by a strict CSP) or
  shipping the multi-megabyte variable font.
- **Coverage gate:** 85% statements/functions/lines and 80% branches across all of `src/app`
  (generated client and mocks excluded).

## Alternatives considered

- **Jest** — would need a community preset; Vitest is first-party now.
- **Karma** — deprecated upstream; slow browser boot on every run.
- **Cypress** — Playwright's mobile emulation, trace viewer and parallelism fit CI better.
- **Biome instead of ESLint + Prettier** — fast, but no Angular template rules (a11y, control flow).
- **Reactive Forms** — proven, but Signal Forms remove the Observable/signal bridging in every form.

## Consequences

- Docker image build is **deferred to Phase 10** together with the Nginx configuration.
- Node 24 is required locally (Angular 22 refuses older Node 22 patch versions).
