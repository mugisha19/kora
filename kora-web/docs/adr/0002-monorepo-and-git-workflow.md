# 0002 — One monorepo, trunk-based commits on `main`

- Status: Accepted
- Date: 2026-09-25

## Context

The web app and the API are built **in parallel, in one working tree** (`F:\Projects\kora`), by two
separate development sessions. The OpenAPI contract lives in the API. A branch switch made by one side
would silently change the files the other side is editing, and both sides share one git index.

## Decision

- One repository: `kora-api/` and `kora-web/` side by side; root files are shared.
- **Trunk-based:** both apps commit directly to `main`. No phase branches, and never
  `checkout`/`switch`/`rebase`/`reset`/`stash` or force-push.
- **Explicit paths on every commit** (`git add <files> && git commit -m "…" -- <files>`), because a
  plain `git commit` would include whatever the other app has staged in the shared index.
- **Ownership:** web owns `kora-web/**` and `.github/workflows/web-ci.yml`; API owns `kora-api/**` and
  `.github/workflows/api-ci.yml`. Other shared root files (`.gitignore`, `.gitattributes`,
  `.editorconfig`, `README.md`, `.gitlab-ci.yml`) are changed only after telling the other side.
- **Phases are marked with tags**, not merges: `web-v0.N.0` / `api-v0.N.0`.
- Commit messages follow Conventional Commits with a mandatory scope (`web[/area]`, `api[/area]`,
  `repo`, `ci`, `deps`, `docs`, `release`), enforced by commitlint in a Husky `commit-msg` hook.
- Husky hooks live in `kora-web/.husky` because the web app owns the Node tooling. The pre-commit
  hook runs lint-staged only when `kora-web/` files are staged, so API-only commits don't need Node.
- The web app reads the contract directly from `../kora-api/docs/openapi.yaml`; contract questions and
  changes are agreed with the API side before either implements them.
- CI is path-filtered per app (GitHub `paths:`, GitLab `rules: changes:`).

## Alternatives considered

- **Phase branches merged with `--no-ff`** (the original plan) — readable history, but unsafe when two
  sessions share one working tree: a checkout by one side rewrites the other's files mid-edit.
- **Two repositories or two worktrees** — isolate the sides, but the contract then has to be copied or
  published, and full-stack changes lose their atomic link.
- **Nx / Turborepo** — overkill for one Angular app and one Maven project.

## Consequences

- History is linear; tags show where each phase ends.
- Every commit must list its files, which also keeps commits small and focused.
- Hooks depend on `npm install` having been run in `kora-web` (the `prepare` script installs them).
