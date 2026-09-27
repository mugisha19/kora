package com.kora.schedule.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A saved copy of the schedule (feature 10): the plan the project is measured against. Baselines are numbered per
 * project and never change; a re-plan saves a new one, so the history of re-plans stays visible.
 */
@Entity
@Table(name = "schedule_baselines")
public class Baseline {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false, updatable = false)
    private int number;

    @Column(name = "saved_at", nullable = false, updatable = false)
    private Instant savedAt;

    @Column(name = "saved_by", nullable = false, updatable = false)
    private UUID savedBy;

    @Column(name = "task_count", nullable = false, updatable = false)
    private int taskCount;

    protected Baseline() {
        // for JPA
    }

    public static Baseline save(
            UUID organizationId, UUID projectId, int number, UUID savedBy, int taskCount, Instant now) {
        Baseline baseline = new Baseline();
        baseline.id = UUID.randomUUID();
        baseline.organizationId = Objects.requireNonNull(organizationId);
        baseline.projectId = Objects.requireNonNull(projectId);
        baseline.number = number;
        baseline.savedBy = Objects.requireNonNull(savedBy);
        baseline.taskCount = taskCount;
        baseline.savedAt = Objects.requireNonNull(now);
        return baseline;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public int getNumber() {
        return number;
    }

    public Instant getSavedAt() {
        return savedAt;
    }

    public UUID getSavedBy() {
        return savedBy;
    }

    public int getTaskCount() {
        return taskCount;
    }
}
