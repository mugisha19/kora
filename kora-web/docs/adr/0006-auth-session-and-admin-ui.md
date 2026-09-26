# 0006 — Sign-in, session lifecycle and administration screens

- Status: Accepted
- Date: 2026-09-27

## Context

Features 01–03 and 23 need: sign-in, organization registration, password reset, invitation links;
staying signed in across reloads without storing tokens where scripts can read them; safe
redirects after sign-in; organization switching; an admin area for members, invitations and
organization settings with optimistic locking; and a profile saved to the account. The UI hides
what a role can't do; the API enforces it.

## Decision

- **Two layouts, three guards.** Public pages render in `AuthLayout` behind `guestGuard`
  (`canActivate` + `canActivateChild`); the app renders in `Shell` behind `authGuard`;
  `roleGuard('ORG_ADMIN')` protects `/admin` and tells the user why they bounced. A top-level
  `'' → /dashboard` redirect comes first, because an empty-path layout route otherwise matches `/`
  with no child. Invitation links (`/invitations/:token`) are public whether or not signed in.
- **`SessionFacade`** owns the lifecycle: `begin` (store the session, apply the profile language,
  go to a validated return URL), `restore` (one silent refresh at start-up, 5 s timeout, run as an
  app initializer so guards see the right state), `switchOrganization` (announced, remembered),
  `expire` (→ `/login?returnUrl=…&reason=expired`), `signOut` (best-effort revoke). `AuthFacade`
  wraps the public auth calls for the pages.
- **`safeReturnUrl()`** only allows same-app paths: absolute, protocol-relative, backslash and
  control-character tricks fall back to the dashboard.
- **Signal Forms everywhere, one submit path.** `submitWithApi()` runs client validation, calls the
  API, puts contract field errors on their fields (`serverErrors()`), shows anything else above the
  form in a `role="alert"` region, lets a page handle special cases (412 → reload offer; expired
  reset link → request a new one) and moves focus to the first invalid field. `FieldError`
  translates errors by kind and follows language changes.
- **Error UX by kind of call.** Form-backed writes and the auth/invitation-link calls are silent in
  the error interceptor (the form shows the error); table actions (role change, remove, revoke)
  keep the global toast. A 412 on a role change reloads the list; on organization settings it shows
  "someone else saved first" with a _Reload latest_ button.
- **Route-scoped SignalStores** (`MembersStore`, `InvitationsStore`) provided by their pages: the
  query (search, filter, sort, page) is the single source of truth and any change reloads from the
  server via `rxMethod` + `switchMap` (stale responses are dropped). Search is debounced.
- **Tests run against the mock API in-process.** `MockApiBackend` sends requests through the real
  interceptor chain to the MSW handlers (with a cookie jar), so page tests exercise real validation,
  tenancy, 412s and refresh.

## Alternatives considered

- **Reactive Forms + a custom error-state matcher** — works, but needs Observable/signal bridging in
  every form; Material 22 reads Signal Forms error state natively.
- **A global admin store** — state would outlive the page and leak between organizations; route
  scope resets it on every visit and every organization switch (which navigates to the dashboard).
- **Guards that call the API to check roles** — slower and redundant: `/me` memberships are in the
  session, and the API enforces on every call anyway.

## Consequences

- Every new form reuses `submitWithApi` + `FieldError`, so error display is consistent.
- Mock-backed component tests are slower than pure unit tests (≈ 10–20 s per file) but catch
  contract-level mistakes early.
- Demo buttons exist only where demo data exists (`environment.demoLogins`); the development
  environment gets them when the API's demo seed lands (API Phase 9).
