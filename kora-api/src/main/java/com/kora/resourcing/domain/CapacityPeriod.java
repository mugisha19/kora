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

/** How many hours a week someone works from a date on (feature 16); 40 until anyone says otherwise. */
@Entity
@Table(name = "capacities")
public class CapacityPeriod {

    public static final BigDecimal STANDARD_WEEK = BigDecimal.valueOf(40);

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "hours_per_week", nullable = false)
    private BigDecimal hoursPerWeek;

    @Column(name = "valid_from", nullable = false, updatable = false)
    private LocalDate validFrom;

    protected CapacityPeriod() {
        // for JPA
    }

    public static CapacityPeriod from(UUID organizationId, UUID userId, BigDecimal hoursPerWeek, LocalDate validFrom) {
        CapacityPeriod period = new CapacityPeriod();
        period.id = UUID.randomUUID();
        period.organizationId = Objects.requireNonNull(organizationId);
        period.userId = Objects.requireNonNull(userId);
        period.validFrom = Objects.requireNonNull(validFrom);
        period.change(hoursPerWeek);
        return period;
    }

    public void change(BigDecimal hours) {
        this.hoursPerWeek = hours.setScale(2, RoundingMode.HALF_EVEN);
    }

    public UUID getUserId() {
        return userId;
    }

    public BigDecimal getHoursPerWeek() {
        return hoursPerWeek;
    }

    public LocalDate getValidFrom() {
        return validFrom;
    }
}
