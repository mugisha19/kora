package com.kora.resourcing.domain;

import com.kora.platform.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** A person's hourly cost from a date on (feature 15). A new rate never rewrites the cost of earlier days. */
@Entity
@Table(name = "cost_rates")
public class CostRate {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "hourly_rate_amount", nullable = false)
    private BigDecimal hourlyRateAmount;

    @Column(nullable = false)
    private String currency;

    @Column(name = "valid_from", nullable = false, updatable = false)
    private LocalDate validFrom;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CostRate() {
        // for JPA
    }

    public static CostRate from(UUID organizationId, UUID userId, Money rate, LocalDate validFrom, Instant now) {
        CostRate costRate = new CostRate();
        costRate.id = UUID.randomUUID();
        costRate.organizationId = Objects.requireNonNull(organizationId);
        costRate.userId = Objects.requireNonNull(userId);
        costRate.validFrom = Objects.requireNonNull(validFrom);
        costRate.change(rate, now);
        return costRate;
    }

    /** A correction for the same start date replaces the amount. */
    public void change(Money rate, Instant now) {
        this.hourlyRateAmount = rate.amount();
        this.currency = rate.currency();
        this.createdAt = Objects.requireNonNull(now);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Money getHourlyRate() {
        return new Money(hourlyRateAmount, currency);
    }

    public LocalDate getValidFrom() {
        return validFrom;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
