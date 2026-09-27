package com.kora.audit.domain;

import com.kora.platform.audit.AuditChain;
import com.kora.platform.audit.AuditRecord;
import com.kora.platform.audit.NotAudited;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

/**
 * A stored audit entry, read-only: the application database role can't update or delete audit rows, and this
 * mapping can't either.
 *
 * <p>Not audited: it is the audit trail.
 */
@NotAudited
@Immutable
@Entity
@Table(name = "audit_events")
public class AuditEntry {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", updatable = false)
    private UUID organizationId;

    @Column(name = "chain_position", nullable = false)
    private long chainPosition;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "actor_ip")
    private String actorIp;

    @Column(name = "user_agent")
    private String userAgent;

    @Column(name = "correlation_id")
    private String correlationId;

    @Column(nullable = false)
    private String action;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id")
    private UUID entityId;

    @Column(name = "entity_label")
    private String entityLabel;

    @Column(name = "project_id")
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuditRecord.Outcome outcome;

    @Column(nullable = false)
    private String changes;

    @Column(name = "previous_hash")
    private String previousHash;

    @Column(nullable = false)
    private String hash;

    protected AuditEntry() {
        // for JPA
    }

    /** Whether the stored hash still matches the stored content and the given predecessor's hash. */
    public boolean isIntact(String expectedPreviousHash) {
        boolean linked = expectedPreviousHash == null || expectedPreviousHash.equals(previousHash);
        AuditRecord content = new AuditRecord(
                organizationId,
                occurredAt,
                actorId,
                null,
                null,
                null,
                action,
                entityType,
                entityId,
                null,
                null,
                outcome,
                Map.of());
        return linked && hash.equals(AuditChain.hash(previousHash, id, content, changes));
    }

    public UUID getId() {
        return id;
    }

    public long getChainPosition() {
        return chainPosition;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public UUID getActorId() {
        return actorId;
    }

    public String getActorIp() {
        return actorIp;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public String getAction() {
        return action;
    }

    public String getEntityType() {
        return entityType;
    }

    public UUID getEntityId() {
        return entityId;
    }

    public String getEntityLabel() {
        return entityLabel;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public AuditRecord.Outcome getOutcome() {
        return outcome;
    }

    /** The changed fields as stored: JSON {@code {"field": {"before": ..., "after": ...}}}. */
    public String getChanges() {
        return changes;
    }

    public String getHash() {
        return hash;
    }
}
