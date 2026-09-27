package com.kora.resourcing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** Hours a person is planned to work on a project in a week (feature 16). */
@Entity
@Table(name = "allocations")
public class Allocation {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "week_start", nullable = false, updatable = false)
    private LocalDate weekStart;

    @Column(nullable = false)
    private BigDecimal hours;

    protected Allocation() {
        // for JPA
    }

    public static Allocation plan(UUID organizationId, UUID projectId, UUID userId, IsoWeek week, BigDecimal hours) {
        Allocation allocation = new Allocation();
        allocation.id = UUID.randomUUID();
        allocation.organizationId = Objects.requireNonNull(organizationId);
        allocation.projectId = Objects.requireNonNull(projectId);
        allocation.userId = Objects.requireNonNull(userId);
        allocation.weekStart = week.monday();
        allocation.change(hours);
        return allocation;
    }

    public void change(BigDecimal newHours) {
        this.hours = newHours.setScale(2, RoundingMode.HALF_EVEN);
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getWeekStart() {
        return weekStart;
    }

    public BigDecimal getHours() {
        return hours;
    }
}
