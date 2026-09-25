# 0002 — One repository, two parallel sessions, commits on `main`

- Status: Accepted
- Date: 2026-09-25

## Context

The API and the web app are built at the same time by two separate working sessions (one per app) in
the same folder, `F:\Projects\kora`, with the specifications in `kora-features/` next to them. The
original plan (the web app's ADR 0002) used one monorepo with a branch per phase
(`api/phase-N-name`) merged with `--no-ff`. That plan assumed one person switching branches at a time.
With two sessions sharing one working tree and one git index, a `git checkout` by either session would
silently change the files under the other.

## Decision

- **One repository** at `F:\Projects\kora`: `kora-api/` and `kora-web/` side by side, shared root files
  (`.gitignore`, `.gitattributes`, `.editorconfig`, `README.md`, `.gitlab-ci.yml`). `kora-features/` stays
  out of the repository (local `.git/info/exclude`).
- **Everyone commits on `main`.** No branch switching, rebasing, resetting, stashing or force-pushing.
- **Explicit paths on every commit** — `git add <files> && git commit -m "…" -- <files>` — because the index
  is shared, and a bare `git commit` would sweep up whatever the other session has staged.
- **Ownership:** the API owns `kora-api/**` and `.github/workflows/api-ci.yml`; the web app owns
  `kora-web/**` and `.github/workflows/web-ci.yml`. A shared root file is changed only after telling the
  other session.
- **Phases are marked by annotated tags** (`api-v0.N.0`, `web-v0.N.0`) instead of merge commits.
- **Conventional Commits** with an app scope: `api[/area]`, `web[/area]`, `repo`, `ci`, `deps`, `docs`,
  `release`.
- **The contract is the only interface between the apps:** `kora-api/docs/openapi.yaml`. Every change to it
  is announced to the web session, which regenerates its client.

## Alternatives considered

- **Branch per phase in a shared working tree** — the other session's files change underneath it on
  every checkout.
- **Git worktree per app** — isolates the branches, but moves each app out of the folder its session and
  tooling already use, and branches still have to be merged back.
- **Two repositories** — the contract has to be copied or published between them, and a full-stack change
  becomes two unlinked histories.

## Consequences

- History is linear per app and easy to read with `git log -- kora-api`.
- Unfinished work is on `main` between phases, so every commit must leave `./mvnw verify` green.
- A phase is reviewed by diffing two tags: `git diff api-v0.1.0 api-v0.2.0 -- kora-api`.
