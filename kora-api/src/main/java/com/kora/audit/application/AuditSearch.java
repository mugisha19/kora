package com.kora.audit.application;

import com.kora.platform.audit.AuditRecord;
import java.time.Instant;
import java.util.UUID;

/**
 * Audit filters; null means "any".
 *
 * @param beforePosition the cursor: only entries earlier in the organization's chain
 */
public record AuditSearch(
        UUID actorId,
        String entityType,
        UUID entityId,
        String action,
        UUID projectId,
        AuditRecord.Outcome outcome,
        Instant from,
        Instant to,
        Long beforePosition) {}
