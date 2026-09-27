# Contract change requests

The web app proposes contract changes here instead of editing `openapi.yaml` itself (ADR 0006). The API session
applies accepted requests in the next contract version and notes the version below.

Template:

```
## <short title>
- Requested by: web, <date>
- Endpoint: <METHOD /path>
- Reason: <what the screen needs and why the current contract doesn't give it>
- Proposed shape: <request/response fields>
- Status: open | accepted in 0.x.0 | declined (reason)
```

## Applied

### 0.1.0 shapes for auth, organization, me, members and invitations
- Requested by: web, 2026-09-25 (agreed over the session channel before the contract was written)
- Endpoints: all of contract 0.1.0
- Status: accepted in 0.1.0, with these additions from the API side: `version` on Member and Organization;
  generic field codes with `params`; 410 codes `invitations.revoked` / `invitations.already_accepted`;
  `auth.unauthenticated`, `access.denied`, `resource.not_found`, `internal.error`; correlation id rules.

### 0.1.1: 400 on the two DELETE operations
- Requested by: api, 2026-09-26 (found while implementing)
- Endpoints: `DELETE /members/{memberId}`, `DELETE /invitations/{invitationId}`
- Reason: a missing or malformed `X-Organization-Id`, or a malformed id, answers `400`, which wasn't declared.
  The contract lint now requires `400` on every tenant-scoped operation.
- Status: accepted in 0.1.1

### 0.2.0: portfolios, projects, charter, WBS and dashboard
- Requested by: api, 2026-09-27 (start of API Phase 3, for web Phase 4)
- Endpoints: 32 new operations (tags Portfolios, Projects, Charter, WBS, Dashboard); `PATCH /organization` gains
  `409 organization.currency_locked`
- Status: accepted in 0.2.0; `GET /dashboard/trends` deferred to Phase 7 (EVM)

### 0.3.0: tasks, board, backlog, sprints
- Requested by: api, 2026-09-27 (start of API Phase 4, for web Phase 5)
- Endpoints: 21 new operations (tags Tasks, Sprints); `WbsNode.percentCompleteSource`; 8 new error codes
- Status: accepted in 0.3.0. Known gap: PATCH can't clear a task's assignee, work package or dates (null means
  unchanged); to be added with explicit nulls when the web app needs it

### 0.4.0: dependencies, schedule, baselines, working calendar
- Requested by: api, 2026-09-27 (start of API Phase 5, for web Phase 6)
- Endpoints: 7 new operations (tag Schedule); Task gains `durationDays`, `scheduleConstraint`, `constraintDate`;
  3 new error codes; seven summaries with doubled apostrophes fixed
- Status: accepted in 0.4.0

### 0.5.0: risks, issues, stakeholders, change requests
- Requested by: api, 2026-09-27 (start of API Phase 6, for web Phase 7)
- Endpoints: 35 new operations (tags Risks, Issues, Stakeholders, ChangeRequests); 6 new error codes
- Status: accepted in 0.5.0; issue comments, configurable severity bands and notifications deferred (Phase 8)
