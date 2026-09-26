# kora-web — conventions for future sessions

Read this file and `docs/PROGRESS.md` before doing anything. Feature specs: `../kora-features/*.md`.

## Scope

- Work only in `kora-web/` (plus `.github/workflows/web-ci.yml`). Never edit `kora-api/`; read
  `../kora-api/docs/openapi.yaml` only.
- The API is built in parallel by another session ("Backend build"). Agree contract shapes with it
  before implementing; build against MSW mocks until the endpoint is live.
- Stop after every phase and wait for "continue".

## Stack

Angular 22.2 (standalone, zoneless, OnPush, signals, `@if/@for/@defer`, Signal Forms), TypeScript 6.0
strict, Angular Material 3 + CDK, NgRx SignalStore, Transloco (en, fr, rw), MSW, ngx-echarts, STOMP
over `/ws`, Vitest + Testing Library, Playwright + axe, ESLint + Prettier, Husky + lint-staged +
commitlint. Node 24.

## Structure

`src/app/core` (singletons: api, auth, session, interceptors, i18n, theme, layout shell) ·
`src/app/shared` (reusable UI, no feature knowledge) · `src/app/features/<feature>` (lazy routes,
facade, store, pages, components) · `src/app/mocks` (MSW handlers and demo data).

## Rules

- No `any` (use `unknown`). Every `@for` has `track`. No business logic in components; use facades.
- Every screen has loading, empty and error states; works at 375 px; WCAG 2.1 AA (axe clean); all
  text translated in en, fr and rw. Status and health are never shown by colour alone.
- The UI hides what a role can't do; the API enforces it.
- Versioned updates send `If-Match`; handle 412 with a clear "someone else saved first" message.
- Call the API only through `core/api/*.api.ts`; import types from `core/api/api.models.ts`, never
  from `generated/`. Every new operation also gets an MSW handler and a mock-API test.
- Errors go through `toApiError()`; show translated messages keyed by `code` (`ErrorMessages`),
  field errors via `serverErrors()`. Reads show an error state; the interceptor toasts failed writes.
- Comments explain WHY. Record decisions in `docs/adr/`, patterns in `docs/PATTERNS.md`,
  interview explanations in `docs/LEARNING.md`.
- Check the latest stable version of a dependency before adding it.

## Angular style

- Standalone components; don't set `standalone: true` or `changeDetection: OnPush` (both default).
- `input()`, `output()`, `model()`, `computed()`, `linkedSignal()`; `inject()` instead of constructors.
- Host bindings in the `host` object, not `@HostBinding`/`@HostListener`.
- Native control flow; `class`/`style` bindings instead of `ngClass`/`ngStyle`; import only the
  directives and pipes a template uses (never `CommonModule`).
- Signal Forms (`@angular/forms/signals`) for new forms; Material inputs bind with `[formField]`.
- Singleton services use `@Service()` (Angular 22) or `@Injectable({ providedIn: 'root' })`.
- Signals: `set`/`update`, never mutate. `NgOptimizedImage` for static images.

## Testing

- Unit tests render with `provideTestUi()` from `src/testing/test-providers.ts` (real translation
  files, fake icons, animations off). Query by role and accessible name.
- Every new string goes into `public/i18n/en.json`, `fr.json` and `rw.json` in the same commit
  (the parity test fails otherwise).
- e2e runs its own dev server on port 4210 (never reuses another app on 4200) and scans pages
  with axe via `e2e/a11y.ts`.

## Commands (run in `kora-web/`)

`npm start` (mock API) · `npm run start:api` (proxy to :8080) · `npm run lint` · `npm run test:ci` ·
`npm run e2e` · `npm run verify` (everything CI runs) · `npm run icons` (after adding an icon name) ·
`npm run api:generate` (after a contract change) · `npm run api:check`

## Git (shared working tree with the API session — see ADR 0002)

- Commit directly on `main`. Never checkout/switch/rebase/reset/stash or force-push.
- Always commit with explicit paths: `git add <files> && git commit -m "…" -- <files>`.
  Never `git add .`/`-A`, never a bare `git commit`.
- If `.git/index.lock` exists, wait and retry; never delete it.
- Conventional Commits with scope `web/<area>` (commitlint enforces it). One file or one tightly
  coupled group per commit. Tag phases `web-v0.N.0`.
- Tell the API session before changing shared root files (`.gitignore`, `.gitattributes`,
  `.editorconfig`, `README.md`, `.gitlab-ci.yml`).
