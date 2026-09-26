# Kora Web

Angular front end for **Kora**, a multi-tenant project & portfolio management platform built on PMI
practices (Agile, Predictive, Hybrid).

> 🚧 In active development: see [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Tech

Angular 22 (standalone, zoneless, signals, Signal Forms) · TypeScript 6 strict · Angular Material 3 ·
NgRx SignalStore · Transloco (en, fr, rw) · MSW · Vitest + Testing Library · Playwright + axe ·
ESLint + Prettier · GitHub Actions + GitLab CI

## Run locally

Requires Node.js 24 (`.nvmrc`).

```bash
cd kora-web
npm ci
npm start           # http://localhost:4200, API mocked in the browser (MSW)
npm run start:api   # same, but /api is proxied to kora-api on http://localhost:8080
npm run verify      # format check, lint, contract check, unit tests with coverage, build
npm run e2e         # Playwright end-to-end tests with axe accessibility scans
npm run api:generate  # regenerate API types after kora-api/docs/openapi.yaml changes
```

### Mock mode

`npm start` serves the API from the browser (MSW) with fictional demo data. The sign-in page has a
one-click button per role (`admin@`, `pmo@`, `pm@`, `member@`, `viewer@kora.demo`, password
`KoraDemo!2026`). Run `window.koraMock.reset()` in the console to restore the demo data. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for demo
invitation links.

## Documentation

- [Architecture decisions](docs/adr/)
- [Design patterns](docs/PATTERNS.md)
- [Learning notes](docs/LEARNING.md)
- Feature specifications: `../kora-features/` (kept outside the repository)
