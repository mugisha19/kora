# Kora Web

Angular front end for **Kora**, a multi-tenant project and portfolio management platform built on
PMI practice (Agile, Predictive, Hybrid): portfolios and projects, charters and WBS, Kanban and
sprints, schedules with the critical path, risks, issues, stakeholders and change control,
timesheets, capacity and earned value, live notifications, an audit trail, files and reports, in
English, French and Kinyarwanda.

Status and what each phase delivered: [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Tech

Angular 22 (standalone, zoneless, signals, Signal Forms) · TypeScript 6 strict · Angular Material 3 ·
NgRx SignalStore · Transloco (en, fr, rw) · STOMP over WebSocket · ECharts · MSW · Vitest + Testing
Library · Playwright + axe · ESLint + Prettier · Nginx image · GitHub Actions + GitLab CI

## Run it

### The whole stack in containers

From the repository root, with Docker:

```bash
docker compose --profile demo up --build
```

Then open http://localhost:4200 and sign in with a demo account (password `KoraDemo!2026`):
`admin@kora.demo`, `pmo@kora.demo`, `pm@kora.demo`, `member@kora.demo` or `viewer@kora.demo`.
Emails arrive in Mailpit at http://localhost:8025.

### The web app on its own

Requires Node.js 24 (`.nvmrc`).

```bash
cd kora-web
npm ci
npm start             # http://localhost:4200, the API mocked in the browser (MSW), live updates included
npm run start:api     # same, but /api and /ws are proxied to kora-api on http://localhost:8080
npm run verify        # format check, lint, contract check, unit tests with coverage, build
npm run e2e           # Playwright end-to-end tests (desktop and phone) with axe accessibility scans
npm run api:generate  # regenerate API types after kora-api/docs/openapi.yaml changes
```

### Mock mode

`npm start` serves the API from the browser (MSW) with fictional demo data: the same accounts as
above, one click each on the sign-in page. In the console, `window.koraMock.reset()` restores the demo
data and `window.koraMock.online(false)` simulates a lost connection for live updates. See
[`docs/PROGRESS.md`](docs/PROGRESS.md) for demo invitation links.

### The image

```bash
docker build -t kora-web kora-web
docker run -p 4200:8080 -e KORA_API_UPSTREAM=host.docker.internal:8080 kora-web
```

Nginx serves the production build and proxies `/api` and `/ws` to `KORA_API_UPSTREAM` (default
`api:8080`). `KORA_STORAGE_ORIGIN` (default `http://localhost:8333`) is the object storage browsers
upload to, allowed by the Content-Security-Policy. See [ADR 0013](docs/adr/0013-nginx-image-and-deployment.md).

## Documentation

- [Architecture decisions](docs/adr/)
- [Design patterns](docs/PATTERNS.md)
- [Learning notes](docs/LEARNING.md)
- Conventions for contributors: [`CLAUDE.md`](CLAUDE.md)
- Feature specifications: `../kora-features/` (kept outside the repository)
