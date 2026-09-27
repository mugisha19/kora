package com.kora.governance;

import java.util.UUID;

/** A change request was approved (its last step) or rejected. Delivered through the outbox after commit. */
public record ChangeRequestDecided(
        String eventKey,
        UUID organizationId,
        UUID projectId,
        UUID changeRequestId,
        String key,
        String title,
        UUID requesterId,
        boolean approved,
        UUID actorId) {}
