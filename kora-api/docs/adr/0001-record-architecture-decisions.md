# 0001 — Record architecture decisions

- Status: Accepted
- Date: 2026-09-25

## Context

Kora is a portfolio project that reviewers will read as much as run. Questions such as "why a modular
monolith?", "why Testcontainers instead of H2?" or "why is the organization a header and not a JWT claim?"
need a written answer that outlives the chat or commit that produced it.

## Decision

Every significant decision in `kora-api` is recorded as a numbered Architecture Decision Record in
`kora-api/docs/adr/NNNN-title.md` with the shape Context → Decision → Alternatives considered →
Consequences. An accepted ADR is never edited except for its status; a changed mind gets a new ADR that
supersedes the old one. The web app keeps its own ADR log in `kora-web/docs/adr/`.

## Alternatives considered

- **Wiki pages or README sections** — drift away from the code and lose their history.
- **One shared ADR log for API and web** — mixes concerns; most decisions belong to one app only.
- **No written record** — decisions become tribal knowledge and interview answers become guesses.

## Consequences

- A small cost per decision, and a large payoff when explaining the system.
- `docs/PATTERNS.md` and `docs/LEARNING.md` link to ADRs instead of repeating them.
