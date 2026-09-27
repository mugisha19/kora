package com.kora.work.domain;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.work.WorkErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A time-boxed iteration with a goal (feature 09). Its commitment is frozen when it starts, so the burndown and the
 * velocity compare against what the team actually committed to, not against a scope that moved during the sprint.
 */
@Entity
@Table(name = "sprints")
public class Sprint {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false)
    private String name;

    private String goal;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SprintStatus status;

    @Column(name = "committed_points")
    private Integer committedPoints;

    @Column(name = "completed_points")
    private Integer completedPoints;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Sprint() {
        // for JPA
    }

    public static Sprint plan(
            UUID organizationId,
            UUID projectId,
            String name,
            String goal,
            LocalDate startDate,
            LocalDate endDate,
            Instant now) {
        Sprint sprint = new Sprint();
        sprint.id = UUID.randomUUID();
        sprint.organizationId = Objects.requireNonNull(organizationId);
        sprint.projectId = Objects.requireNonNull(projectId);
        sprint.rename(name);
        sprint.goal = goal;
        sprint.reschedule(startDate, endDate);
        sprint.status = SprintStatus.PLANNED;
        sprint.createdAt = Objects.requireNonNull(now);
        return sprint;
    }

    public void rename(String newName) {
        ensureOpen();
        this.name = Objects.requireNonNull(newName).strip();
    }

    public void setGoal(String newGoal) {
        ensureOpen();
        this.goal = newGoal;
    }

    public void reschedule(LocalDate start, LocalDate end) {
        ensureOpen();
        LocalDate newStart = start != null ? start : startDate;
        LocalDate newEnd = end != null ? end : endDate;
        if (newEnd.isBefore(newStart)) {
            throw new InvalidInputException(FieldViolation.of(
                    "endDate", PlatformErrorCodes.Field.INVALID, "must not be before the start date"));
        }
        this.startDate = newStart;
        this.endDate = newEnd;
    }

    /** @throws ConflictException {@code sprints.not_planned} unless the sprint is planned */
    public void start(int committed) {
        if (status != SprintStatus.PLANNED) {
            throw new ConflictException(
                    WorkErrorCodes.NOT_PLANNED, "Only a planned sprint can start; this one is " + status);
        }
        this.status = SprintStatus.ACTIVE;
        this.committedPoints = committed;
    }

    /** @throws ConflictException {@code sprints.not_active} unless the sprint is running */
    public void close(int completed) {
        if (status != SprintStatus.ACTIVE) {
            throw new ConflictException(
                    WorkErrorCodes.NOT_ACTIVE, "Only the active sprint can close; this one is " + status);
        }
        this.status = SprintStatus.CLOSED;
        this.completedPoints = completed;
    }

    /** @throws ConflictException {@code sprints.closed}: a closed sprint is history */
    public void ensureOpen() {
        if (status == SprintStatus.CLOSED) {
            throw new ConflictException(WorkErrorCodes.CLOSED, "The sprint is closed");
        }
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

    public String getName() {
        return name;
    }

    public String getGoal() {
        return goal;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public SprintStatus getStatus() {
        return status;
    }

    public Integer getCommittedPoints() {
        return committedPoints;
    }

    public Integer getCompletedPoints() {
        return completedPoints;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
