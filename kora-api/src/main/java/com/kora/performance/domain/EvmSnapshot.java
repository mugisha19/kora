package com.kora.performance.domain;

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

/**
 * A project's cumulative PV, EV and AC as last recorded in a week (feature 17). Kept, so the S-curve shows what was
 * reported at the time even after percentages change, and trends are one indexed read.
 */
@Entity
@Table(name = "evm_snapshots")
public class EvmSnapshot {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "week_start", nullable = false, updatable = false)
    private LocalDate weekStart;

    @Column(nullable = false)
    private String currency;

    @Column(name = "bac_amount", nullable = false)
    private BigDecimal bac;

    @Column(name = "pv_amount", nullable = false)
    private BigDecimal pv;

    @Column(name = "ev_amount")
    private BigDecimal ev;

    @Column(name = "ac_amount", nullable = false)
    private BigDecimal ac;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    protected EvmSnapshot() {
        // for JPA
    }

    public static EvmSnapshot of(UUID organizationId, UUID projectId, LocalDate weekStart) {
        EvmSnapshot snapshot = new EvmSnapshot();
        snapshot.id = UUID.randomUUID();
        snapshot.organizationId = Objects.requireNonNull(organizationId);
        snapshot.projectId = Objects.requireNonNull(projectId);
        snapshot.weekStart = Objects.requireNonNull(weekStart);
        return snapshot;
    }

    /** The week's latest figures replace earlier ones of the same week. */
    public void record(EarnedValueAnalysis analysis, Instant now) {
        this.currency = analysis.bac().currency();
        this.bac = analysis.bac().amount();
        this.pv = analysis.pv().amount();
        this.ev = analysis.ev() == null ? null : analysis.ev().amount();
        this.ac = analysis.ac().amount();
        this.recordedAt = Objects.requireNonNull(now);
    }

    public UUID getProjectId() {
        return projectId;
    }

    public LocalDate getWeekStart() {
        return weekStart;
    }

    public Money bac() {
        return new Money(bac, currency);
    }

    public Money pv() {
        return new Money(pv, currency);
    }

    public Money ev() {
        return ev == null ? null : new Money(ev, currency);
    }

    public Money ac() {
        return new Money(ac, currency);
    }
}
