# 0005 — API layer: generated types, thin services, an interceptor chain and MSW

- Status: Accepted
- Date: 2026-09-26

## Context

The API contract (`kora-api/docs/openapi.yaml`, OpenAPI 3.0.3) is written by the API side and is
the only interface between the apps. The web app must stay in sync with it, handle auth, tenancy,
errors and retries the same way for every call, and be buildable and testable before the API
endpoints exist.

## Decision

1. **Generate types, not a client.** `openapi-typescript` turns the contract into
   `src/app/core/api/generated/schema.ts`; `api.models.ts` gives the types friendly names.
   Requests go through small hand-written services (`AuthApi`, `MeApi`, `OrganizationApi`,
   `MembersApi`, `InvitationsApi`), one method per operation, built on `HttpClient`.
   - `npm run api:generate` regenerates; `npm run api:check` (in `verify` and CI) fails when the
     committed types differ from the contract. CI also runs when only the contract changes.
   - The generator runs through `npx` (its TypeScript 5 peer conflicts with Angular's TS 6) with
     `--default-non-nullable=false`, so request fields with a schema default stay optional.
2. **Interceptors as a Chain of Responsibility**, outermost first:
   correlation id → loading → error toast → retry → auth → tenant.
   - _Correlation id_: a UUID per request, so a user-reported error can be found in API logs.
   - _Error toast_: normalizes every failure to `ApiError` and toasts only writes; reads show an
     error state on the screen, 401s belong to auth, field validation belongs to the form.
   - _Retry_: only idempotent methods, only transient statuses (0, 429 with a short `Retry-After`,
     502–504), exponential backoff, at most two retries.
   - _Auth_: bearer token from memory; proactive refresh 10 s before expiry; on 401 a
     **single-flight** refresh and one replay. A failed refresh clears the session and emits
     `SessionRefresher.expired$`.
   - _Tenant_: `X-Organization-Id` from the session, except on `/auth/*`, `/invitations/token/*`
     and `/me`.
3. **Errors are translated by code.** `ErrorMessages` looks up `errors.codes.<code>`, then
   `errors.status.<status>`, then a generic message; field errors use `errors.fields.<code>` with
   the contract's `params` (`min`, `max`, `allowed`). `serverErrors()` maps `errors[].field` paths
   onto a Signal Forms tree. A `GlobalErrorHandler` logs unexpected errors and shows one toast.
4. **MSW mock API** (`src/app/mocks`) implements every 0.1.0 operation with the contract's rules:
   Problem Details, correlation ids, validation codes and params, tenancy (400/403/404), roles,
   `If-Match` (428/412), paging with capped size and allowed sort fields, refresh-token rotation
   with reuse detection, login rate limiting. It is the default for `npm start` and e2e, persists to
   localStorage, and is swapped in only by the `mock` build configuration (never in dev/prod bundles).
   Its behaviour is unit-tested through MSW's `getResponse()` without a service worker.

## Alternatives considered

- **Full generated Angular client (openapi-generator, ng-openapi-gen)** — more generated code to
  review, Java tooling or opinionated services; thin services cost a few lines per operation and
  read like the contract.
- **`openapi-fetch`** — typed and tiny, but bypasses `HttpClient`, so no interceptors, no
  `HttpTestingController`, and no Angular resource/`httpResource` integration.
- **A JSON-server or local Node mock** — a second process to run; MSW intercepts in the browser
  and in tests, with no ports and no CORS.
- **Toasting every error** — duplicates what screens and forms already show, and floods the user.

## Consequences

- A contract change is one `npm run api:generate`; TypeScript then points at every affected call.
- The mock can drift from the real API; the mock-API tests pin its behaviour to the contract, and
  `npm run start:api` runs the same app against the real API once endpoints land.
- The mock cannot set an HttpOnly cookie (MSW writes through `document.cookie`), so it uses a
  readable `Path=/` cookie; the app never reads it, so the code path is identical.
