# Learning notes — kora-web

Plain-language explanations of the ideas behind this codebase, written so you can explain them in
an interview. Each phase adds sections.

## Zoneless change detection (Phase 0)

Older Angular used **Zone.js**, which patched every browser API (timers, events, XHR) so Angular knew
"something might have changed" and re-checked the whole component tree. Angular 22 is **zoneless by
default**: it re-renders only when a signal it reads changes, a template event fires, or an `async`
pipe emits. **Why it matters:** smaller bundle, fewer pointless checks, cleaner stack traces.
**Interview line:** "Change detection is pull-based on signals instead of push-based on monkey-patched
async APIs."

## OnPush (Phase 0)

With OnPush, a component is re-checked only when its inputs change (by reference), an event happens
inside it, or a signal it reads changes. That's why state is kept **immutable**: replace an array
instead of pushing into it, otherwise OnPush won't notice. Angular 22 makes OnPush the default, and
our ESLint rule makes it mandatory.

## Signals in one paragraph (Phase 0)

A signal is a value that notifies whoever reads it when it changes: `count = signal(0)`,
`double = computed(() => count() * 2)`, `effect(() => log(count()))`. RxJS remains the tool for
**events over time** (WebSocket messages, debounced search); signals are the tool for **state at a
point in time**. The bridge is `toSignal()` / `toObservable()`.

## Strict TypeScript and strict templates (Phase 0)

`strict: true` forbids implicit `any` and forces null handling. `strictTemplates` applies the same type
checking inside HTML templates, so `{{ project.nmae }}` fails the build instead of rendering blank.
Extended diagnostics are errors too (for example `{{ count }}` instead of `{{ count() }}`).

## Problem Details and one error shape (Phase 0)

The API answers errors with **RFC 9457 Problem Details**: `status`, `title`, `detail`, plus our
`code` (stable, e.g. `members.last_admin`), `correlationId` and field `errors[]`. The browser can also
see errors that are _not_ Problem Details: a network failure (status 0), an HTML page from a proxy, a
thrown exception. `toApiError()` is an **adapter** that maps all of them to one `ApiError`, so the UI
decides what to show from `code` alone and translates it. The `correlationId` lets support find the
exact server log line for an error a user reports.

## Mock mode vs real API (Phase 0)

`npm start` runs the app with **MSW** answering API calls inside the browser (a service worker), so the
front end can be built and demoed before the API exists, and e2e tests need no backend.
`npm run start:api` switches to the real API through the dev-server **proxy**: the browser only talks
to `localhost:4200`, so cookies stay same-origin and no CORS setup is needed in development.

## Conventional Commits and hooks (Phase 0)

Commit messages follow `type(scope): summary`, e.g. `feat(web/board): add column WIP limits`.
**commitlint** rejects bad messages in the `commit-msg` hook; **lint-staged** runs ESLint and Prettier
only on staged files in `pre-commit`, so it stays fast.

## Trunk-based development (Phase 0)

Two people (here: two sessions) share one working tree, so we commit straight to `main` in small
commits and mark phases with tags. Every commit lists its files explicitly so one side never commits
the other side's staged work. See ADR 0002.

## Path-filtered CI in a monorepo (Phase 0)

A CSS change shouldn't run the Java test suite. GitHub Actions `paths:` and GitLab `rules: changes:`
start a pipeline only when that app's folder changed.

## Unit vs end-to-end tests, and automated accessibility (Phase 0)

**Vitest** runs component and service tests in Node with a fake DOM (jsdom): fast, on every commit.
**Playwright** drives a real browser against the running app for the critical user flows, at desktop
size and at 375 px. Each e2e page also runs an **axe** scan for WCAG 2.1 AA violations. axe catches
only part of accessibility problems automatically, so keyboard and screen-reader checks still matter.
