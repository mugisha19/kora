# 0014 — Report exports and demo data

- Status: Accepted
- Date: 2026-09-28

## Context

Phase 9 builds features 21 and 22.

- **Report exports:** project status, portfolio summary, risk register, EVM and timesheets, as PDF for reading and
  Excel for analysis.
  - They must show exactly what the requester sees on screen.
  - They must be in the requester's language and the organization's currency and time zone.
  - They must be safe from spreadsheet formula injection.
  - A large export must not exhaust memory.
- **Demo data:** a fictional organization that tells a coherent story across every feature, created in a `demo`
  profile that production never runs.

## Decision

### Reports: a module of its own, with the data owners as plug-ins

The `reports` module knows no project, risk or timesheet. Its API (`com.kora.reports`) has two parts:

- **A format-neutral content model.** A report is sections of facts and tables of typed cells: text, quantity,
  amount, percent, date and blank. Each format presents each type properly: numbers stay numbers in Excel, and
  amounts and dates are formatted in the reader's language in PDF.
- **`ReportSource`, the plug-in for one report type.** It is implemented by the module that owns the data:

  | Type | Source | Module |
  | --- | --- | --- |
  | `PROJECT_STATUS` | `ProjectStatusReport` | reporting |
  | `PORTFOLIO_SUMMARY` | `PortfolioSummaryReport` | reporting |
  | `RISK_REGISTER` | `RiskRegisterReport` | governance |
  | `EVM` | `EvmReport` | performance |
  | `TIMESHEETS` | `TimesheetReport` | resourcing |

  Each source builds its content with its module's own services and access checks. A report therefore shows what
  the member would see: the risk register of the whole organization is filtered by project visibility, and the
  timesheet summary is for the project's managers, as the timesheet screen is.

  The dependency points from the data modules to `reports`, never back, so the modules stay acyclic.

**The exporters use the Template Method pattern.**

- `ReportExporter.export` fixes the steps and their order:
  1. load the data (the source, in one read-only transaction);
  2. build the model (adding who made the report, when, and for which organization);
  3. render;
  4. store.
- A format only implements `render`, plus its content type and extension:
  - `PdfReportExporter`: an XHTML template (Thymeleaf, XML mode, every value escaped) printed by Flying Saucer on
    OpenPDF.
  - `ExcelReportExporter`: POI's streaming `SXSSFWorkbook`, which keeps 100 rows in memory and flushes the rest to a
    temporary file.

**`ReportExporterFactory` picks the source by type and the exporter by format.** Both are found among the Spring
beans, and a missing one stops startup. A new format or report type is therefore one new class (and its enum value
in the contract), with no other change.

**Jobs are asynchronous, through the outbox.**

- `POST /reports` checks the parameters and access at once, so a 400, 403 or 404 comes back immediately. It then
  stores a `QUEUED` job and publishes `ReportRequested`.
- The runner generates the report after the commit:
  - It runs as the requester, with their current membership. Someone who lost access in the meantime gets a failed
    job, not the data.
  - At most two reports render at a time.
  - It stores the file in object storage (`platform.storage`, shared with attachments since this phase).
  - It publishes `ReportReady` or `ReportFailed`, which notify the requester (`REPORT_READY` and `REPORT_FAILED`,
    linking to `/reports`).
- `GET /reports/{id}` returns a 5-minute download link that always downloads.
- A member can have at most 5 jobs waiting (`409 reports.too_many_pending`).
- Files and jobs are purged after 7 days.
- Exports are audited like every entity, so the trail shows who exported what: exports are how data leaves.

**Formula injection.**

- Text whose first character a spreadsheet would read as a formula (`=`, `+`, `-`, `@`, tab or carriage return, per
  OWASP) gets Excel's *quote prefix* flag. This is what typing a leading apostrophe does, and the cell stays text
  even when edited or saved as CSV.
- We chose this over literally prepending `'`, which would change the data and show in every cell.
- Only text cells are concerned: numbers, amounts and dates are written as numeric cells.

**PDF safety and fonts.**

- The renderer resolves no URL except Flying Saucer's own default style sheet. Nothing a user typed can make the
  server fetch a URL or read a file while printing.
- Batik, which Flying Saucer needs even without SVG, therefore never sees outside content.
- Liberation Sans (SIL OFL, `openpdf-fonts-extra`) is embedded as Unicode. The standard PDF fonts stop at Western
  European characters, and French digit grouping alone needs U+202F.

### Demo data: told through the public API, with the owning modules filling in the past

`DemoDataSeeder` (profile `demo`) runs after startup, in the background. It does nothing when `admin@kora.demo`
exists, so it is idempotent and a restart keeps what reviewers changed.

It tells the story (`DemoStory`) through Kora's own REST API, signed in as the person who would act:

- the PMO creates projects;
- managers write charters and plan the work;
- the sponsor approves;
- the team moves tasks and logs time;
- managers approve timesheets.

Every rule, event, notification and audit entry is therefore the real one. The story is fixture data with no rules
of its own, and it can't drift from the API's invariants.

**Two things the API can't do are handled separately:**

- **Adding members without an emailed invitation token.** `organization.MemberProvisioning`, implemented only in the
  demo profile, adds existing accounts to an organization. The accounts themselves come from
  `identity.UserAccounts`.
- **History, because the API only records "now".** `platform.demo.DemoHistory` implementations in the owning
  modules fill it in, in the demo profile only:
  - `DemoBurndownHistory` in work draws the daily burndown of sprints that ran before the demo existed.
  - `DemoEvmHistory` in performance writes the weekly EVM snapshots behind the S-curve and the dashboard trends.
    PV and AC are the real figures as of each week; EV follows PV at today's SPI.

**The story mirrors the web app's mock data.** It has the same organizations, people, portfolios, programs and
projects, so mock mode and the real API look alike.

- **Health is computed, not set** (except the ERP override), and the story is tuned for it:
  - the mobile app has finished about 60% of its points at 57% of its time (GREEN);
  - the portal is past its end date with a little work left (AMBER);
  - the ERP rollout has a critical risk past its review, and the PMO's override (RED).
- **Other screens with something to show:**
  - risks in every heat-map band, and issues;
  - stakeholders in every quadrant;
  - change requests at every step (draft, submitted, in review, implemented, rejected);
  - 12 weeks of timesheets with the last one awaiting approval;
  - allocations that overload one person;
  - a closed and an active sprint;
  - a predictive project with a critical path and a baseline;
  - projects on hold and closed;
  - a second organization for the switcher.
- **Password.** The demo password is published (`KoraDemo!2026`). `DemoProfileGuard` refuses to start when `demo` and
  `prod` are both active.

## Consequences

- **Wide-table readability:** Excel exports are streamed, but the content model holds the rows in memory. Report
  sizes (thousands of rows) make that fine. A report of millions of rows would need a row iterator in the model.
- **PDF rendering is CPU-bound:** the two-permit limit keeps the API responsive, and a second instance would add
  capacity through the same outbox.
- **Demo seeding speed:** seeding takes about a minute of API calls. A nightly reset for a public demo, and
  `docker compose --profile demo`, come with Phase 10's container image.
- **Outbox republishing:** outstanding outbox publications are now republished at startup
  (`republish-outstanding-events-on-restart`). This was assumed in ADR 0013 but off by default.
  `OutboxMaintenance` retries failed deliveries while running (after 15 minutes, 5 attempts at most) and deletes
  completed publications after a week.
