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

## One theme for light and dark: `light-dark()` (Phase 1)

CSS `light-dark(#fff, #111)` picks a value based on the element's `color-scheme`. Material 3 can
emit all of its design tokens this way, so a single theme covers both schemes. Switching theme is
then one attribute on `<html>` (`data-theme="dark"` → `color-scheme: dark`), and "System" simply
removes the attribute so the OS preference applies. **Interview line:** "Theme switching is a
`color-scheme` change, not a stylesheet swap."

## Design tokens and "not colour alone" (Phase 1)

Status colours (on track / at risk / off track) are tokens with a foreground and background pair
checked for contrast in both schemes. WCAG 1.4.1 says colour must not be the only way to convey
information, so `StatusChip` always adds a different icon shape and a text label: a colour-blind
user or a screen reader gets the same meaning.

## Runtime i18n and the parity test (Phase 1)

Transloco loads `public/i18n/<lang>.json` on demand and re-renders text when the language changes,
without a reload. Three details make it accessible: `<html lang>` follows the language so screen
readers switch pronunciation; each language option carries its own `lang` attribute ("Français" is
read in French); and page titles are translated too. A unit test compares fr and rw with en key by
key, so a missing translation fails CI instead of showing English (or a raw key) to users.

## Focus management in a single-page app (Phase 1)

In a classic website, loading a new page resets focus to the top. In an SPA the URL changes but
focus stays on the clicked link, so a screen-reader user doesn't know the content changed. After
every navigation the shell focuses the new page's `<h1>` (made focusable with `tabindex="-1"`),
which announces the page name. The **skip link** is the first Tab stop and jumps past the toolbar
and navigation to the same heading.

## Accessible menus and toggles (Phase 1)

The theme and language menus use `role="menuitemradio"` with `aria-checked`, so assistive tech says
"Dark, radio, checked". The settings page uses Material button toggles, which render as a
`radiogroup` labelled by the section heading. Changes are announced through a polite **live region**
(CDK `LiveAnnouncer`), which speaks without moving focus.

## Deterministic UI tests (Phase 1)

jsdom has no layout and never fires CSS `transitionend`, so animated components (drawer, dialog)
finish on fallback timers and tests become flaky under load. Unit tests therefore provide
`MATERIAL_ANIMATIONS: { animationsDisabled: true }`. Tests also load the real translation files and
query by **role and accessible name** (Testing Library), which checks accessibility and behaviour
at the same time.

## Contract-first with generated types (Phase 2)

The API team owns `openapi.yaml`. `openapi-typescript` turns it into TypeScript types, and CI runs
`api:check`, which regenerates the types and fails if they differ from the committed ones. When the
contract changes, regenerating makes the TypeScript compiler list every place in the app that no
longer matches. **Interview line:** "The contract is the single source of truth; drift is a build
failure, not a production bug."

## The interceptor chain (Phase 2)

An Angular interceptor sees every request and response, and each one does a single job (Chain of
Responsibility). Order matters: the outermost interceptor sees the final outcome of everything
inside it. Ours is correlation id → loading → error toast → retry → auth → tenant. The toast sits
outside retry and auth, so a request that was retried or re-authenticated successfully never shows
an error. The correlation id is outermost, so every retry of one user action carries the same id.

## Access token in memory, refresh token in an HttpOnly cookie (Phase 2)

The short-lived access token (15 min) lives only in a JavaScript variable (the session store), so it
disappears on reload and can't be read from storage by injected script. The long-lived refresh
token is in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`: JavaScript can't
read it, other sites can't send it, and it only goes to the refresh endpoint.

## Single-flight refresh (Phase 2)

When the token expires, ten parallel requests all get 401. If each refreshed on its own, the first
would rotate the refresh token and the other nine would present an already-used one, which the API
treats as theft and revokes the session. So the first 401 starts the refresh and everyone else
subscribes to the same in-flight call (`shareReplay`), then replays with the new token. A request
that fails after someone else already refreshed simply retries with the newer token.

Single-flight works inside one tab; two **tabs** share the cookie but not the JavaScript. If both
refresh at the same instant, the API rotates the token for the winner and rejects the loser with
`auth.refresh_invalid`. The API tolerates that reuse for 10 s, so the loser waits ~200 ms and retries
once; by then the winner's new cookie is in the browser's shared cookie jar and the retry succeeds.
A reuse after 10 s is treated as theft and revokes the whole session.

## Retry only what is safe to repeat (Phase 2)

A GET can be repeated without side effects (idempotent); a POST that times out might already have
created an invitation. So only GET/HEAD/OPTIONS are retried, only for transient failures (network
blip, 502/503/504, a 429 with a short `Retry-After`), with **exponential backoff** (400 ms, 800 ms) so
a struggling server isn't hammered.

## Errors users can act on (Phase 2)

The API returns a stable `code` and field `params`; the app translates those, never the English
`detail`. Reads that fail show an error state with "Try again" on the screen; failed writes show a
toast with a reference number; validation errors appear next to the field (`serverErrors()` maps
`objectives[2].metric` onto the Signal Forms tree). Unknown codes fall back to a generic message, so
a newer API can't break an older client.

## Mocking at the network layer with MSW (Phase 2)

Mock Service Worker registers a service worker that answers `/api/v1/*` inside the browser. The app
code is unchanged: `HttpClient`, interceptors and cookies all run for real. The mock implements the
contract's rules (validation, tenancy, locking, token rotation), and its behaviour is unit-tested by
calling the handlers directly with `getResponse()`. The mock is only included in the `mock` build,
so it never ships.

## Open redirects and `returnUrl` (Phase 3)

After sign-in the app returns to the page you wanted (`/login?returnUrl=/settings`). If it trusted
that parameter blindly, a phishing link like `/login?returnUrl=https://evil.example` would send a
freshly signed-in user to an attacker's page (OWASP A01). `safeReturnUrl()` accepts only same-app
paths and rejects `//host`, `/\host` (browsers treat it like `//`), absolute URLs and control
characters. Anything suspicious goes to the dashboard.

## Guards hide, the API enforces (Phase 3)

Route guards (`authGuard`, `guestGuard`, `roleGuard`) decide which screens the UI offers, so a
viewer never sees an Administration link and gets a clear message if they type the URL. They are
not security: anyone can call the API directly. The API checks the token, the organization
membership and the role on every request, and the UI simply reflects that.

## Why login errors are generic (Phase 3)

"Wrong password" versus "no such account" tells an attacker which emails are registered. The API
answers both with `auth.invalid_credentials` (and the same timing), and the page shows one sentence.
"Forgot password" likewise always answers "if an account exists…".

## One way to submit a form (Phase 3)

Every form goes through `submitWithApi()`: client validation first (`submit()` marks fields
touched and skips the call when invalid), then the API call; the contract's field errors are placed
on their fields, anything else becomes one message at the top in an alert region, and focus moves
to the first invalid field so keyboard and screen-reader users land on the problem. Material leaves
`aria-invalid` off _empty_ required inputs, so the helper finds invalid fields by the form field's
error class instead.

## Optimistic locking in the UI (Phase 3)

Updates carry `If-Match: "<version>"`. If someone else saved in between, the API answers 412 and
nothing is overwritten. The UI then explains what happened: the members list simply reloads (a
single field), while the organization form keeps your edits on screen and offers _Reload latest_,
so you can see their version and redo your change deliberately.

## Route-scoped stores (Phase 3)

The members and invitations stores are provided by their pages, not the root injector: state
exists while the page is open and is thrown away when you leave or switch organization, so one
organization's data can never flash on another's screen. The query (search, filter, sort, page) is
the store's single source of truth; `rxMethod` + `switchMap` reloads on every change and drops
responses that arrive after a newer request.

## Testing against the mock API in-process (Phase 3)

Component tests provide `MockApiBackend`, an `HttpBackend` that hands each request to the MSW
handlers (`getResponse`) after it has gone through the real interceptor chain. A test that types a
taken email into the register form therefore gets the same 409 with `errors[{field:"email"}]` the
API would send, and checks that the message appears on the email field.

## Don't recompute what the server decides (Phase 4)

Health, allowed transitions, WBS codes and rolled-up progress are business rules. If the UI
recomputed them, the two would drift the first time a rule changed. The screens show what the API
sends and refetch after a change; the mock API implements the rules so the screens can be built
before the backend exists.

## Money without floats (Phase 4)

`0.1 + 0.2 !== 0.3`. Amounts travel as decimal strings (`"150000000"` RWF, `"99.90"` USD),
`parseAmount()` turns user input into that form (accepting spaces, commas, apostrophes), and
`Intl.NumberFormat.format()` accepts strings, so formatting is exact too. Arithmetic (roll-ups,
earned value) happens on the server; the mock uses BigInt.

## An accessible tree (Phase 4)

The WAI-ARIA tree pattern: one tab stop (roving `tabindex`), arrows to move, Right/Left to open,
close or go to parent, Home/End, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`.
The accessible name must be short (`aria-labelledby` on the code and title) — by default a
treeitem's name includes every descendant's text. Every keyboard command also has a visible
button, and moves are announced.

## Filters in the URL, and focus (Phase 4)

A filter kept in component state is lost on reload and can't be shared. Kept in the URL it is
both, and Back works. The catch: a router navigation normally moves focus to the new page's
heading — correct for a new page, wrong when only the query changed while someone types in a
search box. The shell compares paths and leaves focus alone for query-only navigations.

## Effects that call stores (Phase 4)

`effect(() => store.load(id()))` looks harmless, but everything the store reads synchronously
while loading becomes a dependency of the effect; when the store updates that state, the effect
runs again — an endless reload. Pass the signal itself (`store.load(this.projectId)`) to an
`rxMethod`, or read the input and call the store in `untracked()`.

## Charts that don't depend on colour (Phase 4)

A chart is an image: assistive technology gets a table with the same numbers, the canvas is
`aria-hidden`, segments carry patterns (ECharts decals) and text labels, and the chart library is
loaded only when the chart scrolls into view.

## Accessible drag and drop (Phase 5)

Dragging needs a pointer and good aim, so every drag has a keyboard path: a "Move" menu on each
card (up, down, each column the task may go to) and Move up/down buttons in the backlog. After a
move, a live region says where the card went ("position 2 of 5"), and focus goes back to the
card — moving a DOM node drops focus, which would leave keyboard users at the top of the page.

## Optimistic UI and rollback (Phase 5)

Waiting for the server before a dropped card moves feels broken; moving it first and never
checking is wrong when the server refuses (WIP limit, illegal transition, remaining work). The
board does both: the card moves at once, the API decides, and a reload shows the truth — either
the saved order or the card back where it was, with the reason.

## Why ranks are strings (Phase 5)

Lexorank-style ranks let one task move by rewriting one row: the new rank sits between its
neighbours' ranks. The client only sends "after this task, before that one" and sorts by the
strings it gets back; it never does arithmetic on them.

## Velocity is a range, not a promise (Phase 5)

Committed points are frozen when a sprint starts; completed points are recorded when it closes.
Showing the recent low–high range ("18 to 23 points, 20.75 on average") plans honestly; a single
number invites treating velocity as a performance target.

## Rendering user Markdown safely (Phase 5)

`innerHTML` plus a sanitizer is one bug away from script injection. Parsing a small Markdown
subset into data and rendering it with templates means the text can only ever become text, bold,
lists and vetted links.
