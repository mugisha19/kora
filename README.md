# Kora

**Kora** is a multi-tenant project and portfolio management platform built on PMI practice. One
organization runs Agile, Predictive and Hybrid projects side by side: portfolios and programs,
charters with approval, work breakdown structures, Kanban boards and sprints, schedules with the
critical path and baselines, risks, issues, stakeholders and change control with an approval chain,
timesheets, capacity and earned value, live notifications and an activity feed, an append-only
audit trail, file attachments and PDF/Excel reports. The interface speaks English, French and
Kinyarwanda and meets WCAG 2.1 AA.

## Run it

With Docker, from this folder:

```bash
docker compose --profile demo up --build
```

On the first start the API creates the demo organizations, which takes about a minute; it is done when
the API logs `Demo data ready` (`docker compose logs -f api`). Then open http://localhost:4200 and sign in
with a demo account (password `KoraDemo!2026`):

| Account            | Role in Akagera Digital Ltd                        |
| ------------------ | -------------------------------------------------- |
| `admin@kora.demo`  | Organization administrator (also PMO in Virunga Build Partners) |
| `pmo@kora.demo`    | PMO                                                |
| `pm@kora.demo`     | Project manager                                    |
| `member@kora.demo` | Team member                                        |
| `viewer@kora.demo` | Viewer                                             |

Emails (invitations, password resets, notifications) arrive in Mailpit at http://localhost:8025.
Stop with `docker compose --profile demo down` (add `-v` to delete the data).

Without `--profile demo`, the same command starts only the API's development services (PostgreSQL,
Redis, Mailpit, SeaweedFS) for running the apps from source.

## What's inside

| Folder                     | What                                                                    | Stack                                                                                  |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`kora-api/`](kora-api/)   | REST API (`/api/v1`, OpenAPI contract), STOMP live updates, jobs, audit | Spring Boot 4.1 (Spring Modulith), Java 25, PostgreSQL 18 with row-level security, Redis, S3-compatible storage, OpenTelemetry |
| [`kora-web/`](kora-web/)   | Web app, served by Nginx, which also proxies the API                    | Angular 22, Angular Material 3, Transloco, ECharts, STOMP, MSW                         |
| [`compose.yaml`](compose.yaml) | The whole stack in one command (includes each app's compose file)  | Docker Compose                                                                         |

The API contract is [`kora-api/docs/openapi.yaml`](kora-api/docs/openapi.yaml); the web app's types
are generated from it and CI checks that they match.

## Develop

Each app has its own README with commands:

- [`kora-api/README.md`](kora-api/README.md) — run the API from source, tests, the demo profile
- [`kora-web/README.md`](kora-web/README.md) — run the web app against the mock API (no backend
  needed) or the real one, tests, the image

## Quality

- Tests: the API with JUnit, Testcontainers (real PostgreSQL, Redis and S3), ArchUnit and Spring
  Modulith module rules, with every response checked against the contract and list endpoints checked for
  N+1 queries; the web app with Vitest + Testing Library and Playwright end-to-end tests with axe
  accessibility scans on desktop and phone sizes.
- CI on GitHub Actions and GitLab CI: format, lint, contract check, tests with coverage, and container
  images scanned with Trivy (the web image is also smoke-checked).
- Security: tenant isolation, role checks, short-lived tokens with rotated refresh cookies, rate
  limits, a strict Content-Security-Policy, presigned uploads with content checks, and a
  hash-chained audit trail.

## Documentation

- Architecture decisions: [`kora-api/docs/adr/`](kora-api/docs/adr/) and
  [`kora-web/docs/adr/`](kora-web/docs/adr/)
- Progress and what each phase delivered: [`kora-api/docs/PROGRESS.md`](kora-api/docs/PROGRESS.md) and
  [`kora-web/docs/PROGRESS.md`](kora-web/docs/PROGRESS.md)
- Design patterns and learning notes: `docs/PATTERNS.md` and `docs/LEARNING.md` in each app
