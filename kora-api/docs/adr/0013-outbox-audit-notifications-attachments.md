# 0013 — Outbox, audit trail, notifications and attachments

- Status: Accepted
- Date: 2026-09-27

## Context

Phase 8 builds features 18–20:
- notifications, in the app, by email and live;
- the project activity feed;
- an audit trail that shows any tampering;
- file attachments.

Three risks drove the design:
- A notification must never announce a change that rolled back, and must not be lost when the process dies right
  after a commit.
- The audit trail must be complete: a service that forgets to log a change would leave a hole.
- Uploaded files are untrusted input: a renamed executable, a macro-laden document, or an HTML file served from our
  origin.

## Decision

### Transactional outbox (Spring Modulith)

Domain events that leave the transaction are stored with it:
- `TaskAssigned`, `ApprovalRequested`, `ChangeRequestDecided`, `TimesheetDecided`, `RiskReviewOverdue` and
  `IssueEscalated`.
- `spring-modulith-starter-jpa` writes one `event_publication` row per listener in the same transaction as the change.
- After the commit, the `@Async @TransactionalEventListener` runs on another thread, and its row is marked complete
  when it returns.
- A rollback leaves no row. A crash leaves an incomplete row, which is resubmitted.

Delivery is therefore at least once:
- Every event carries an `eventKey`, and `notifications` has `UNIQUE (organization_id, user_id, event_key)`.
- A redelivery is a no-op.
- Two concurrent deliveries of the same event resolve on the constraint, and the loser retries and skips.

Listeners are asynchronous, so they start with no tenant. Each one binds the event's organization before starting its
transaction (`TenantTransactions.inOrganization`). This is why they don't use `@ApplicationModuleListener`, whose
transaction would start unscoped (ADR 0007).

### Audit trail: captured once, below the services

A Hibernate `PostInsert/PostUpdate/PostDelete` listener (`platform.audit.EntityChangeAuditor`) records every change to
a `com.kora` entity:
- **What it records:** the changed fields as before and after.
- **What it leaves out:**
  - `version`;
  - collections;
  - secrets, which are redacted;
  - long text, which is truncated at 500 characters;
  - snapshots, sequences and tokens, which are excluded with `@NotAudited` and a reason.
- **Where the rows are written:**
  - on the session's own connection;
  - in a Hibernate before-completion callback, after the last flush and in the same transaction;
  - so a change and its audit row commit or roll back together.

  Spring's `beforeCommit` would run before Hibernate's final flush and miss changes.
- **Where the context comes from:**
  - the actor comes from the security context;
  - the correlation id comes from the request;
  - the IP is masked to its network (`/24`, or the first three IPv6 groups), so that it isn't personal data.
- **Refused requests (403) and sign-ins:** recorded by `AuditTrail` in their own transaction, since the request itself
  fails or writes nothing.

The trail is a hash chain per organization:
- Each row stores `SHA-256(previous hash | id | content | changes)`.
- Rows are serialized per organization by `pg_advisory_xact_lock`.
- `GET /audit/verify` recomputes the chain and names the first broken entry.
- The application role can't rewrite history: `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM kora_app`, and the
  entity is `@Immutable`.
- A database administrator still can, and the chain then shows it.
- Changes outside any organization (a user's profile, notification preferences) go to the system chain. They are
  written in the same transaction with the scope raised to `system` for that one insert.

**The activity feed is a projection of the trail:** `SUCCESS` rows with the project's id, readable by everyone who
sees the project. It needs no second write path, so the feed and the trail can't disagree.

### Notifications

- Each notification is stored with a translation key and parameters, not text, so each client renders it in its
  user's language. Emails are rendered server-side in the recipient's locale (en, fr, rw).
- Links are web-app paths:
  - `/projects/{id}/tasks/{taskId}`;
  - `/projects/{id}/change-requests/{crId}`;
  - `/projects/{id}/risks/{id}`;
  - `/projects/{id}/issues/{id}`;
  - `/timesheets/{isoWeek}`.
- **Recipients:**
  - A task's new assignee, unless they assigned it themselves.
  - For an approval: the step's named approver, or everyone holding the step's role except the requester.
  - For decisions: the requester or the timesheet owner.
  - An overdue review goes to the risk's owner, once a day.
  - A critical issue unresolved for three days goes to the PMO, falling back to administrators when nobody holds the
    role.
- **Preferences:** per person and kind, not per organization, like the account itself. Everything shows in the app. By
  default, only what someone must act on (assignments, approvals) is also emailed.

### Live updates: STOMP over WebSocket

- **Endpoint:** `/ws`, with the in-memory simple broker. It suits one instance; several instances would relay to a
  shared broker (RabbitMQ STOMP) without client changes.
- **Handshake:** browsers can't set headers on it, so it is open. The STOMP `CONNECT` frame carries
  `Authorization: Bearer` and `X-Organization-Id`, and `StompAuthorization` checks the token with the API's
  `JwtDecoder` and the membership with `organization.Memberships`.
- **Subscriptions:**
  - `/user/queue/notifications` (per user and organization);
  - `/topic/projects/{id}`, checked with `ProjectAccess.readable` exactly as REST would, 404 and 403 alike refused;
  - anything else, and `SEND`, is refused.
- **Pushes:** best effort. A client that missed one catches up from the REST list, which reads the same rows.
- **Limitation:** access is checked when a client subscribes. A member removed from a project keeps their open
  subscription until they reconnect, which happens at the latest when their 15-minute token expires.

### Attachments: presigned URLs to S3-compatible storage

- **The API never carries the bytes.**
  - `POST /attachments/uploads` checks the owner's project (participating) and the extension, then returns a presigned
    `PUT` URL, valid 15 minutes, that only accepts the declared `Content-Type`.
  - The client uploads straight to storage, then calls `complete`.
- **`complete` checks what arrived:**
  - the stored size must match the announced size;
  - the real type is sniffed from the bytes, never taken from the name or the client (`ContentSniffer`). Binary
    formats are recognised by their magic numbers, Office files by their package's main part through
    `ZipFile`'s central directory (nothing is inflated, so a ZIP bomb costs nothing), and text must be clean UTF-8;
  - macro-enabled Office files (`vbaProject.bin`) are refused whatever their extension;
  - a mismatch deletes the object at once (`409 attachments.content_mismatch`);
  - the SHA-256 is stored.
- **Downloads** are presigned `GET` URLs, valid 5 minutes, forcing `Content-Disposition: attachment` and
  `application/octet-stream`. An uploaded HTML or SVG file can never run in our origin.
- **Storage keys** are ours (`org/{organization}/{attachment}`), never the user's file name.
- **Deletion** is soft. `AttachmentPurge` removes the file and its row 30 days later, and uploads never completed
  after a day. It removes each organization's attachments in that organization's scope, so the removal is audited.
- **Malware scanning** is not done yet: `scanStatus` is `NOT_SCANNED`, and a ClamAV adapter can set it later without a
  contract change.

**No AWS SDK.** Presigned requests are one algorithm (SigV4 in the query string), about a hundred lines, verified
against AWS's published example (`SigV4PresignerTest`). The API signs its own calls (`HEAD`, `GET`, `DELETE`, bucket
creation) the same way over `java.net.http`. This avoids a large dependency tree for four HTTP calls.

**SeaweedFS, not MinIO, locally and in tests.** MinIO stopped publishing its community images, and SeaweedFS is
maintained and S3-compatible. The integration tests run it with authentication on, so every signature is really
checked. The API creates the bucket and a CORS rule for the web origin when `kora.storage.create-bucket` is set (dev
and tests). Production points `kora.storage.*` at S3 or any compatible store, with no defaults.

## Consequences

- **Cost:** every write pays one extra insert per changed entity and a per-organization advisory lock. That is fine
  at Kora's write rates. Bulk imports would batch or bypass auditing explicitly, never silently.
- **The rule for new entities:** new entities are audited by default, and anything that shouldn't be needs
  `@NotAudited` with a reason. A forgotten annotation over-audits; it never under-audits.
- **Outbox rows:** completed rows accumulate in `event_publication`. A cleanup job (keep 7 days) belongs to Phase 10's
  operations work.
- **Integration tests** now run on a random port, so the WebSocket tests share the one cached context.
