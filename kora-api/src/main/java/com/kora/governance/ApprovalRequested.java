package com.kora.governance;

import java.util.UUID;

/**
 * A change request's next approval step is waiting: for a named approver, or for anyone with a role (the requester
 * excepted). Delivered through the outbox after commit.
 */
public record ApprovalRequested(
        String eventKey,
        UUID organizationId,
        UUID projectId,
        UUID changeRequestId,
        String key,
        String title,
        UUID approverId,
        String approverRole,
        UUID requesterId) {}
