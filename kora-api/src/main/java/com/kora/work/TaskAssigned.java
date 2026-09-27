package com.kora.work;

import java.util.UUID;

/**
 * A task was given to someone other than the person assigning it. Delivered through the outbox after commit
 * (notifications), so it carries its organization and a key that makes redelivery harmless.
 */
public record TaskAssigned(
        String eventKey,
        UUID organizationId,
        UUID projectId,
        UUID taskId,
        String key,
        String title,
        UUID assigneeId,
        UUID actorId) {}
