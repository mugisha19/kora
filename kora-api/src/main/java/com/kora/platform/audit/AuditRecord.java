package com.kora.platform.audit;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * One audit entry before it is chained and stored.
 *
 * @param organizationId null for security events before an organization is chosen (signing in)
 * @param changes changed fields with their values before and after; secrets appear without values
 */
public record AuditRecord(
        UUID organizationId,
        Instant occurredAt,
        UUID actorId,
        String actorIp,
        String userAgent,
        String correlationId,
        String action,
        String entityType,
        UUID entityId,
        String entityLabel,
        UUID projectId,
        Outcome outcome,
        Map<String, FieldChange> changes) {

    public enum Outcome {
        SUCCESS,
        DENIED
    }

    /** A field's value before and after; either is null when the field didn't exist or holds a secret. */
    public record FieldChange(Object before, Object after) {}
}
