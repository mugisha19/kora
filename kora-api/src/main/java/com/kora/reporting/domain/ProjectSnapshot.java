package com.kora.reporting.domain;

import com.kora.platform.audit.NotAudited;
import com.kora.platform.money.Money;
import com.kora.portfolio.Health;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * The dashboard's read model: everything a portfolio dashboard shows about one project, in one row. It is derived
 * data (rebuilt from the owning modules on every change), so it has no invariants and no optimistic locking.
 *
 * <p>Not audited: a read model rebuilt from audited sources.
 */
@NotAudited
@Entity
@Table(name = "project_snapshots")
public class ProjectSnapshot {

    @Id
    @Column(name = "project_id")
    private UUID projectId;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "portfolio_id", nullable = false)
    private UUID portfolioId;

    @Column(name = "program_id")
    private UUID programId;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "manager_id", nullable = false)
    private UUID managerId;

    @Column(nullable = false)
    private String status;

    @Column(nullable = false)
    private String methodology;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "target_end_date", nullable = false)
    private LocalDate targetEndDate;

    @Column(nullable = false)
    private String currency;

    @Column(name = "budget_amount")
    private BigDecimal budgetAmount;

    @Column(name = "planned_cost_amount", nullable = false)
    private BigDecimal plannedCostAmount;

    @Column(name = "earned_value_amount", nullable = false)
    private BigDecimal earnedValueAmount;

    @Column(name = "percent_complete", nullable = false)
    private BigDecimal percentComplete;

    @Column(name = "next_milestone_name")
    private String nextMilestoneName;

    @Column(name = "next_milestone_date")
    private LocalDate nextMilestoneDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Health health;

    @Column(name = "health_reason")
    private String healthReason;

    @Column(name = "health_overridden", nullable = false)
    private boolean healthOverridden;

    @Column(nullable = false)
    private int severity;

    @Column(nullable = false)
    private boolean late;

    @Column(name = "pv_amount")
    private BigDecimal pvAmount;

    @Column(name = "evm_ev_amount")
    private BigDecimal evmEvAmount;

    @Column(name = "actual_cost_amount")
    private BigDecimal actualCostAmount;

    private BigDecimal spi;

    private BigDecimal cpi;

    @Column(name = "open_critical_risks", nullable = false)
    private int openCriticalRisks;

    @Column(name = "pending_change_requests", nullable = false)
    private int pendingChangeRequests;

    @Column(name = "refreshed_at", nullable = false)
    private Instant refreshedAt;

    protected ProjectSnapshot() {
        // for JPA
    }

    public ProjectSnapshot(UUID projectId, UUID organizationId) {
        this.projectId = projectId;
        this.organizationId = organizationId;
    }

    /** Everything that can change, overwritten on each refresh. */
    public record Values(
            UUID portfolioId,
            UUID programId,
            String code,
            String name,
            UUID managerId,
            String status,
            String methodology,
            LocalDate startDate,
            LocalDate targetEndDate,
            String currency,
            Money budget,
            Money plannedCost,
            Money earnedValue,
            BigDecimal percentComplete,
            String nextMilestoneName,
            LocalDate nextMilestoneDate,
            Health health,
            String healthReason,
            boolean healthOverridden,
            boolean late) {}

    /**
     * Earned value (feature 17) and governance (features 11, 14) figures.
     *
     * @param ev null when the project's percent-complete method has nothing to measure with
     */
    public record Performance(
            Money pv,
            Money ev,
            Money actualCost,
            BigDecimal spi,
            BigDecimal cpi,
            int openCriticalRisks,
            int pendingChangeRequests) {}

    public void refresh(Values values, Performance performance, Instant now) {
        this.pvAmount = performance.pv().amount();
        this.evmEvAmount = performance.ev() == null ? null : performance.ev().amount();
        this.actualCostAmount = performance.actualCost().amount();
        this.spi = performance.spi();
        this.cpi = performance.cpi();
        this.openCriticalRisks = performance.openCriticalRisks();
        this.pendingChangeRequests = performance.pendingChangeRequests();
        this.portfolioId = values.portfolioId();
        this.programId = values.programId();
        this.code = values.code();
        this.name = values.name();
        this.managerId = values.managerId();
        this.status = values.status();
        this.methodology = values.methodology();
        this.startDate = values.startDate();
        this.targetEndDate = values.targetEndDate();
        this.currency = values.currency();
        this.budgetAmount = values.budget() == null ? null : values.budget().amount();
        this.plannedCostAmount = values.plannedCost().amount();
        this.earnedValueAmount = values.earnedValue().amount();
        this.percentComplete = values.percentComplete();
        this.nextMilestoneName = values.nextMilestoneName();
        this.nextMilestoneDate = values.nextMilestoneDate();
        this.health = values.health();
        this.healthReason = values.healthReason();
        this.healthOverridden = values.healthOverridden();
        this.severity = HealthRule.severity(values.health());
        this.late = values.late();
        this.refreshedAt = now;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getPortfolioId() {
        return portfolioId;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public UUID getManagerId() {
        return managerId;
    }

    public String getStatus() {
        return status;
    }

    public LocalDate getTargetEndDate() {
        return targetEndDate;
    }

    public Money getBudget() {
        return budgetAmount == null ? null : new Money(budgetAmount, currency);
    }

    public Money getPlannedCost() {
        return new Money(plannedCostAmount, currency);
    }

    public Money getEarnedValue() {
        return new Money(earnedValueAmount, currency);
    }

    public BigDecimal getPercentComplete() {
        return percentComplete;
    }

    public String getNextMilestoneName() {
        return nextMilestoneName;
    }

    public LocalDate getNextMilestoneDate() {
        return nextMilestoneDate;
    }

    public Health getHealth() {
        return health;
    }

    public String getHealthReason() {
        return healthReason;
    }

    public boolean isHealthOverridden() {
        return healthOverridden;
    }

    public Money getPlannedValue() {
        return pvAmount == null ? null : new Money(pvAmount, currency);
    }

    public Money getEvmEarnedValue() {
        return evmEvAmount == null ? null : new Money(evmEvAmount, currency);
    }

    public Money getActualCost() {
        return actualCostAmount == null ? null : new Money(actualCostAmount, currency);
    }

    public BigDecimal getSpi() {
        return spi;
    }

    public BigDecimal getCpi() {
        return cpi;
    }

    public int getOpenCriticalRisks() {
        return openCriticalRisks;
    }

    public int getPendingChangeRequests() {
        return pendingChangeRequests;
    }

    public boolean isLate() {
        return late;
    }
}
