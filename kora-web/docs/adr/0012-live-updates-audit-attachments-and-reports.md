# 0012 — Live updates, audit trail, attachments and report exports

- Status: Accepted
- Date: 2026-09-28

## Context

Features 18–21 (contracts 0.7.0 and 0.8.0) add what happens around the work: notifications that
reach people as they happen, a project activity feed, an append-only audit trail with item
history, files stored in S3-compatible storage, and PDF/Excel reports made in the background. The
API owns every rule: the transactional outbox decides what is notified and recorded, STOMP
authorizes each subscription, storage links are presigned and short-lived, content types are
detected from the bytes, and a hash chain makes the audit trail tamper-evident. The web has to
show all of it clearly, keep lists current without reloads, survive a lost connection, and work
the same against the mock API.

## Decision

- **One live connection, behind an interface.** `LiveUpdates` (root) opens one connection per
  signed-in organization and replaces it when the session changes. A `LiveTransport` hides the
  wire: `StompTransport` uses `@stomp/rx-stomp` (loaded lazily, exponential backoff up to 30 s,
  the current access token on every CONNECT, resubscription after reconnects) against `/ws`
  through the dev proxy or Nginx; `MockBrokerTransport` talks to the mock API's in-page broker,
  which applies the same rules (token and membership on connect, only visible projects on
  subscribe) and can simulate a lost network (`window.koraMock.online(false)`). Tests use the mock
  transport, never a real socket.
- **Catch up, don't replay.** After a reconnect `reconnected$` fires; the notification center,
  approvals badge, activity feed and open tabs reload what they show. The offline banner appears
  only after 4 s without a connection, so quick reconnects don't flash it.
- **The bell and its panel.** `NotificationCenter` (root) keeps the first page, adds live arrivals
  (announced politely, never taking focus) and marks read optimistically. The panel is a side
  sheet grouped by day in the organization's time zone; each notification is a sentence built
  from its `titleKey` and raw params (people resolved through the organization's members,
  approved/rejected wording, report names), with a fallback for kinds this build doesn't know.
  Preferences live in Settings (per person, no organization header).
- **Observer on the workspace.** `refreshOnActivity()` reloads the board, backlog, schedule and
  registers when someone else changes their items (debounced), so two people see the same board.
  The Activity tab prepends live entries. Task links (`/projects/<id>/tasks/<taskId>`) open the
  task over the board or schedule; closing it returns to the tab.
- **History and the audit log.** A "Change history" disclosure under tasks, risks, issues, change
  requests and projects loads only when opened. Admin → Audit log filters by person, item type,
  kind and dates in the URL, opens each entry's field changes as a table, checks the hash chain,
  and exports the rows shown to CSV with formula-injection escaping. Field names are translated
  where known and split into words otherwise; ids become names; money and enums become words.
- **Attachments in three steps.** `AttachmentsPanel` refuses files the API would refuse (type,
  size, empty) before any bytes move, then starts the upload, PUTs the bytes with XMLHttpRequest
  (fetch can't report upload progress) and exactly the returned headers — never the access token
  — and completes it. Each file shows progress and can be cancelled; only network and storage
  failures offer a retry (a refused type or content would fail again). Downloads ask for a fresh
  link each time; images get thumbnails.
- **Reports as jobs.** `ReportJobs` (root) queues exports, follows them through the REPORT_READY
  notification with polling as a fallback, toasts when one queued here is done, and downloads
  through a fresh link. An Export menu (PDF or Excel) sits on the dashboard, project overview,
  risks, earned value and time tabs; `/reports` lists my jobs and makes any report.
- **The mock as a small backend.** `mocks/outbox.ts` runs after every handled request (MSW
  lifecycle events in the browser, `respond()` in tests): it snapshots the targeted item, diffs
  it, appends a hash-chained audit row, writes the project activity, applies the API's
  notification rules and pushes to the broker. Refused requests are recorded as denied. The object
  store behind presigned links sniffs content like the API.

## Consequences

- Lists stay current across people without polling; a lost connection is visible and heals.
- The same UI runs against the mock and the real API; the transport is the only difference.
- Presigned uploads need the storage's CORS rule to allow the web's origin.
- Browsers without Kinyarwanda locale data format relative times and lists in English inside
  Kinyarwanda sentences (as dates already do).
