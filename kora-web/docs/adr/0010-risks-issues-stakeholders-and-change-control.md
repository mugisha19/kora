# 0010 — Risks, issues, stakeholders and change control

- Status: Accepted
- Date: 2026-09-28

## Context

Features 11–14 (contract 0.5.0, 35 operations) add project governance: a risk register with
probability × impact scoring and a heat map, an issue log, a stakeholder register with the
power/interest grid, and change requests approved through a chain that depends on the change's
size (project manager, then PMO, then sponsor). The API owns every rule — severity bands, which
strategies suit a threat or an opportunity, overdue and escalation flags, who decides each step,
and what the last approval changes. The UI must show these without relying on colour, keep
filters shareable, and give notification links (Phase 9) a page to land on.

## Decision

- **Four workspace tabs for every methodology.** `METHODOLOGY_STRATEGIES` appends Risks, Issues,
  Stakeholders and Changes to each methodology's tabs; governance isn't tied to agile or
  predictive work.
- **Details that own a URL.** A risk or an issue opens in a side sheet at `/risks/<id>` or
  `/issues/<id>` — the paths the API's notifications use. The tab stays mounted (its register,
  filters and scroll position survive); a child route component calls `routeSheet()`, which opens
  the sheet, swaps it when the id changes, and navigates back to the list (query kept) when it
  closes. A change request has a full page at `/change-requests/<id>`: its impact and approval
  timeline need the room.
- **Facades per tab, `resource()` for reads.** Each tab provides a facade (`RiskFacade`,
  `IssueFacade`, `StakeholderFacade`, `ChangeFacade`) that opens dialogs with the caller's rights,
  calls the API and announces the result. Reads are `resource()`s whose params include the
  facade's `version` signal, so every write reloads what depends on it without a store per tab.
  The sheets get the tab's injector (`MatDialogConfig.injector`), so they use the same facade.
- **Rights mirrored for affordances only.** "Owner or manager" (risks, issues), "requester or
  manager" (change requests) and "whose step is it" (`awaitsMe`: a named approver, or any holder
  of the step's role except the requester, with ORG_ADMIN taking PMO steps) decide which buttons
  appear; the API enforces them (403, `change_requests.self_approval`).
- **The heat map is a table.** Rows are probability 5 → 1, columns impact 1 → 5, headers name the
  levels; each occupied cell is a toggle button whose text is its count and band ("1 · Critical")
  and whose label says everything. Choosing a cell filters the register (`?cell=4-4`) to the
  cell's risk ids, which the heat map returns — so the counts and the register always agree.
- **Guided scoring.** Probability and impact options describe each level (e.g. "4 · Likely
  (50–80%)"); the dialog previews score and band; the strategy list changes with the kind and a
  mismatched strategy is cleared. Existing risks are re-scored only through assessments, whose
  history is a small line chart plus a list.
- **Stakeholders on a real grid.** Four labelled quadrants laid out as the classic power/interest
  grid, each a heading (a toggle that filters the register) and a list of people as buttons
  marked with their engagement gap in words; the engagement matrix marks current and desired
  levels with translated letters and hidden words for screen readers.
- **"My approvals" everywhere.** `ApprovalsInbox` (root) loads `/approvals/pending` per
  organization and after every decision; the toolbar shows a count badge (the number is also in
  the link's name) and `/approvals` lists what waits for you with the step's reason.
- **No money in floats.** Cost changes are typed as signed decimal strings (`parseSignedAmount`)
  and shown with their sign; the share of the budget is the API's step reason, not a client
  calculation.
- **Health includes risks.** The mock's health rule adds the API's clause (an open critical risk
  past its review date, or without a response plan a week after it was raised → red), and the
  dashboard now shows open critical risks and pending change requests, with a list of critical
  risks across the projects in view.

## Consequences

- Deep links and notifications open the exact item over its list, and the back button works.
- The approval inbox refreshes on decisions and organization changes; changes made by others
  appear when live notifications arrive (Phase 9).
- Rights are expressed twice (UI affordance, API enforcement); the API stays the authority and
  the UI shows its refusal if the two ever disagree.
