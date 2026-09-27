package com.kora.schedule.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.schedule.domain.SchedulingStrategy.Link;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** A link between two tasks of one project. Links are added and removed, never edited, so there is no version. */
@Entity
@Table(name = "task_dependencies")
public class Dependency {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "predecessor_id", nullable = false, updatable = false)
    private UUID predecessorId;

    @Column(name = "successor_id", nullable = false, updatable = false)
    private UUID successorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private DependencyType type;

    @Column(name = "lag_days", nullable = false, updatable = false)
    private int lagDays;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Dependency() {
        // for JPA
    }

    public static Dependency link(
            UUID organizationId,
            UUID projectId,
            UUID predecessorId,
            UUID successorId,
            DependencyType type,
            int lagDays,
            Instant now) {
        if (predecessorId.equals(successorId)) {
            throw new InvalidInputException(FieldViolation.of(
                    "successorId", PlatformErrorCodes.Field.INVALID, "a task can't depend on itself"));
        }
        Dependency dependency = new Dependency();
        dependency.id = UUID.randomUUID();
        dependency.organizationId = Objects.requireNonNull(organizationId);
        dependency.projectId = Objects.requireNonNull(projectId);
        dependency.predecessorId = predecessorId;
        dependency.successorId = Objects.requireNonNull(successorId);
        dependency.type = Objects.requireNonNull(type);
        dependency.lagDays = lagDays;
        dependency.createdAt = Objects.requireNonNull(now);
        return dependency;
    }

    public Link asLink() {
        return new Link(predecessorId, successorId, type, lagDays);
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getPredecessorId() {
        return predecessorId;
    }

    public UUID getSuccessorId() {
        return successorId;
    }

    public DependencyType getType() {
        return type;
    }

    public int getLagDays() {
        return lagDays;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
