# 0011 — Governance: risks, issues, stakeholders and change control

- Status: Accepted
- Date: 2026-09-27

## Context

Phase 6 builds features 11–14: the risk register, the issue log, the stakeholder register, and change requests
with a multi-level approval chain. Change control is the first feature that writes to other modules' data (budget,
target end date, charter, schedule baseline) on behalf of someone who may not manage the project.

## Decision

**One `governance` module** for the four registers. They share keys, the "manager or owner" rule and the approval
flow, and they depend on `portfolio`, `schedule` and `organization` (never the other way round).
- `reporting` reads `GovernanceQueries` and listens to `RiskChanged`.
- Keys are per project and kind (`AKG-12-R3`, `-I7`, `-CR2`), numbered from a locked `governance_sequences` row, as
  task keys are (ADR 0009).

**Who may do what.**
- Everyone on the project reads.
- Its managers and contributors raise risks, issues and change requests.
- A risk's or issue's owner, or the project's managers, change it.
- Only managers close and reopen issues, maintain stakeholders and mark changes implemented.
- A change request's requester or a manager edits, submits, withdraws and revises it.
- The approval steps decide who approves.

**Risks.**
- The score (probability × impact) is a generated column, so lists filter and sort by it. Java computes the same
  value for the entity in hand.
- Probability and impact change only through `POST /assessments`, which stores a history row, so re-scoring is
  always traceable. PATCH doesn't accept them.
- A response strategy must fit the risk kind: no "exploit" for a threat.
- The planned statuses need a strategy and a plan.
- Closed risks are read-only.
- Materializing opens the linked issue and closes the risk in one transaction.
- Severity bands are the feature's fixed defaults (15+ critical). Making them configurable per organization is
  deferred until someone asks.

**Project health (feature 05).** An open critical risk counts as "open past its response date" when:
- its review date has passed, or
- it still has no response plan a week after it was raised.

`HealthRule` already had the input, which now comes from `GovernanceQueries`. Risk changes refresh the snapshot
synchronously, and the hourly pass catches risks that become overdue with time.

**Issues** follow a State pattern, `OPEN ⇄ IN_PROGRESS → RESOLVED → CLOSED`; resolved or closed issues can be
reopened. Resolving needs a resolution, and reopening clears it. `overdue` and `escalated` (critical and unresolved
for more than 3 days) are derived when the issue is read. The escalation message itself is a notification
(Phase 8).

**Stakeholders.**
- The quadrant (high means 3 or more on 1–5) and the engagement gap are derived.
- Registers are small, so their filters run in memory.
- Deleting a stakeholder anonymizes the row (name replaced, contact details, notes, affiliation and user link
  erased) instead of deleting it, so personal data goes and nothing that points at the row breaks (GDPR, Rwanda law
  058/2021).
- The column holding the stakeholder's own organization is named `affiliation`, so it is never confused with the
  tenant.

**Change requests: Chain of Responsibility.** `ApprovalHandler` links `ProjectManagerApproval` → `PmoApproval` →
`SponsorApproval`. Each handler looks at the impact and the organization's thresholds (default 5% / 10 working
days / 15%, `change_control_settings`) and decides whether its level must approve. Rules for building the chain:
- The chain is built and frozen at submission, so later threshold changes don't move a request already on its way.
- Without a budget, any cost change counts as exceeding every threshold.
- **Nobody approves their own request.** When the requester is the step's named approver, the step goes to a role:
  the PMO decides for the project manager, and an administrator decides for the sponsor. Role steps never accept
  the requester, and an `ORG_ADMIN` may stand in for the PMO.
- A rejection needs a comment and skips the remaining steps. A rejected request is revised as a new row with the
  same key and the next revision number, so every decision stays as it was made.

**The last approval applies the change atomically.** It calls `portfolio.ProjectChangeControl.apply`, then
`schedule.SchedulePlanning.rebaseline`, in the same transaction as the decision:
- budget += cost delta, never below zero;
- target end date moved by the schedule delta in working days (the organization calendar);
- when the charter scope changes: the approved charter is superseded by a new approved version, with the scope
  summary added to its in-scope list and the summary budget adjusted;
- a new schedule baseline for Predictive and Hybrid projects when the schedule moved.

These ports have no access checks of their own: the approval chain is the authorization. Keeping them separate
from `ProjectAccess.manageable` keeps that rule explicit. `ChangeRequestApproved` is published for the audit trail
(Phase 8).

## Alternatives considered

- **An if/else in the service to build the chain.** Every new level would grow the same method; handlers can be
  added, reordered and tested alone.
- **Configurable rules stored as data (a rules engine).** More flexible than needed; the thresholds are
  configurable, the levels are code.
- **Hard-deleting stakeholders.** Anything referencing them would break, and the audit trail would lose the entry.
- **Letting approvers edit the project through the normal endpoints.** Sponsors and the PMO would need manager
  rights on every project, or the change would be applied in several requests that can fail halfway.

## Consequences

- A change request is the only way an approved charter changes; the charter history shows each amendment and its
  approver.
- Notifications (review due, escalation, "your approval is needed") are events waiting for Phase 8's listeners;
  the flags are already in the API.
- Two currency usages (budgets, change requests) now lock the organization currency.
