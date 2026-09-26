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
