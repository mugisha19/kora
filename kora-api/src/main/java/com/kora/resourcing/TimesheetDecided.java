package com.kora.resourcing;

import java.util.UUID;

/** A timesheet was approved or sent back. Delivered through the outbox after commit. */
public record TimesheetDecided(
        String eventKey,
        UUID organizationId,
        UUID projectId,
        UUID timesheetId,
        UUID ownerId,
        String week,
        boolean approved,
        String comment,
        UUID actorId) {}
