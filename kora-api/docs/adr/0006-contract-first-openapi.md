# 0006 — Contract-first API with a hand-written OpenAPI 3.0 document

- Status: Accepted
- Date: 2026-09-25

## Context

The API and the web app are built at the same time by separate sessions. The web app generates a typed client
and mocks the API (MSW) until real endpoints exist, so it needs the contract before the implementation. Once
the endpoints exist, nothing may let the implementation and the document drift apart.

## Decision

- **`kora-api/docs/openapi.yaml` is the source of truth**, written by hand and versioned (`info.version`,
  starting at `0.1.0`). Endpoints are added to it at the start of the phase that implements them.
- **OpenAPI 3.0.3, not 3.1.** Client generators and the Java request/response validators we use support 3.0
  fully; 3.1 support is still uneven. Nothing in our API needs 3.1-only JSON Schema features.
- **The contract is linted in the build** (`OpenApiContractTest`): it must parse without warnings, and every
  operation must follow ADR 0005, including Problem Details for every 4xx/5xx, `X-Correlation-Id` on every
  response, `X-Organization-Id` on exactly the tenant-scoped operations, `If-Match` with `412`/`428` on
  versioned updates, and a fixed list of public operations.
- **Error codes are checked both ways** (`ErrorCodesContractTest`): every `*ErrorCodes` constant in Java and every
  code mentioned in a response description must be in the `ErrorCode` enum.
- **From Phase 2, implemented endpoints are validated against the contract** in integration tests (request and
  response bodies, status codes, headers) with Atlassian's `swagger-request-validator`.
- The web session proposes changes in `docs/contract-requests.md`; the API session applies them and announces
  each new contract version.

## Alternatives considered

- **Code-first (springdoc generates the spec from controllers)** — the contract would only exist after the code,
  blocking the web app, and accidental changes to a DTO would silently change the contract.
- **Generating Spring interfaces and DTOs from the spec (openapi-generator)** — strong compile-time coupling,
  but the generated classes (mutable beans, `JsonNullable`, Jackson 2 assumptions) fight with records,
  Jackson 3 and our validation style. Validating real responses in tests gives the same guarantee with
  idiomatic code.
- **No enforcement, review only** — drift is inevitable over 24 features.

## Consequences

- The web app can build every screen against mocks derived from the same file.
- A contract change is a deliberate, reviewable diff to one YAML file, tagged with a version.
- Tests fail when the implementation diverges from the contract, whichever side changed.
