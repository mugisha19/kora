# 0001 — Record architecture decisions

- Status: Accepted
- Date: 2026-09-25

## Context

Kora is a portfolio project that reviewers will read as much as run. Choices such as "why NgRx
SignalStore?" or "why a custom Gantt?" need a written answer that outlives the chat or commit that
made them.

## Decision

Every significant decision in `kora-web` is recorded as a numbered Architecture Decision Record in
`kora-web/docs/adr/NNNN-title.md` using this shape: Context → Decision → Alternatives considered →
Consequences. ADRs are never edited after acceptance except for status; a changed mind gets a new
ADR that supersedes the old one.

## Alternatives considered

- **Wiki pages / README sections** — drift away from the code and lose history.
- **No written record** — decisions become tribal knowledge, and interview answers become guesses.

## Consequences

- Small cost per decision; large payoff when explaining the system.
- `docs/PATTERNS.md` and `docs/LEARNING.md` link to ADRs instead of repeating them.
