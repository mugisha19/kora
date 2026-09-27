package com.kora.work.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** The story points left in a sprint on one day; the burndown's "actual" line is made of these. */
@Entity
@Table(name = "sprint_day_progress")
public class SprintDayProgress {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "sprint_id", nullable = false, updatable = false)
    private UUID sprintId;

    @Column(nullable = false, updatable = false)
    private LocalDate day;

    @Column(name = "remaining_points", nullable = false)
    private int remainingPoints;

    protected SprintDayProgress() {
        // for JPA
    }

    public static SprintDayProgress of(UUID organizationId, UUID sprintId, LocalDate day, int remainingPoints) {
        SprintDayProgress progress = new SprintDayProgress();
        progress.id = UUID.randomUUID();
        progress.organizationId = Objects.requireNonNull(organizationId);
        progress.sprintId = Objects.requireNonNull(sprintId);
        progress.day = Objects.requireNonNull(day);
        progress.remainingPoints = remainingPoints;
        return progress;
    }

    public LocalDate getDay() {
        return day;
    }

    public int getRemainingPoints() {
        return remainingPoints;
    }
}
