package com.kora.governance;

import java.util.UUID;

/** A critical issue stayed unresolved for more than three days: the PMO should step in. Raised once per issue. */
public record IssueEscalated(
        String eventKey, UUID organizationId, UUID projectId, UUID issueId, String key, String title) {}
