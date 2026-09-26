package com.kora.portfolio.domain;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.portfolio.Health;
import com.kora.portfolio.PortfolioErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.OptimisticLock;
import org.hibernate.annotations.TenantId;

/**
 * A temporary endeavour with its own methodology, manager, dates and budget (PMBOK). Its lifecycle is the
 * {@link ProjectStatus} state machine; {@code PROPOSED → APPROVED} happens only when its charter is approved.
 */
@Entity
@Table(name = "projects")
public class Project {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "portfolio_id", nullable = false)
    private UUID portfolioId;

    @Column(name = "program_id")
    private UUID programId;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "manager_id", nullable = false)
    private UUID managerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Methodology methodology;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProjectStatus status;

    @Column(name = "status_reason")
    private String statusReason;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "target_end_date", nullable = false)
    private LocalDate targetEndDate;

    @Column(name = "budget_amount")
    private BigDecimal budgetAmount;

    @Column(name = "budget_currency")
    private String budgetCurrency;

    /**
     * Written by the dashboard's health rule on every refresh. Excluded from optimistic locking: a recomputed health
     * must not make the manager's next save fail with 412 as if a person had edited the project.
     */
    @Enumerated(EnumType.STRING)
    @OptimisticLock(excluded = true)
    @Column(name = "computed_health", nullable = false)
    private Health computedHealth;

    @OptimisticLock(excluded = true)
    @Column(name = "computed_health_reason")
    private String computedHealthReason;

    @Enumerated(EnumType.STRING)
    @Column(name = "health_override")
    private Health healthOverride;

    @Column(name = "health_override_reason")
    private String healthOverrideReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Project() {
        // for JPA
    }

    public static Project propose(
            UUID organizationId,
            UUID portfolioId,
            UUID programId,
            String code,
            String name,
            String description,
            UUID managerId,
            Methodology methodology,
            LocalDate startDate,
            LocalDate targetEndDate,
            Money budget,
            Instant now) {
        Project project = new Project();
        project.id = UUID.randomUUID();
        project.organizationId = Objects.requireNonNull(organizationId);
        project.portfolioId = Objects.requireNonNull(portfolioId);
        project.programId = programId;
        project.code = Objects.requireNonNull(code);
        project.name = Objects.requireNonNull(name).strip();
        project.description = description;
        project.managerId = Objects.requireNonNull(managerId);
        project.methodology = Objects.requireNonNull(methodology);
        project.status = ProjectStatus.PROPOSED;
        project.reschedule(startDate, targetEndDate);
        project.changeBudget(budget);
        project.computedHealth = Health.GREY;
        project.createdAt = Objects.requireNonNull(now);
        return project;
    }

    // ---- Lifecycle --------------------------------------------------------------------------------------------

    /**
     * A manual lifecycle move.
     *
     * @throws ConflictException {@code projects.charter_approval_required} for {@code APPROVED}, which only the
     *     charter approval may do; {@code projects.invalid_transition} for any move the current state doesn't allow
     * @throws InvalidInputException when a reason is required and missing
     */
    public void transitionTo(ProjectStatus target, String reason) {
        if (target == ProjectStatus.APPROVED) {
            throw new ConflictException(
                    PortfolioErrorCodes.CHARTER_APPROVAL_REQUIRED,
                    "A project is approved by approving its charter, not by a status change");
        }
        moveTo(target, reason);
    }

    /** The charter was approved: the project is now authorized. No-op if it already moved on. */
    public void authorizeByCharter() {
        if (status == ProjectStatus.PROPOSED) {
            moveTo(ProjectStatus.APPROVED, "Charter approved");
        }
    }

    private void moveTo(ProjectStatus target, String reason) {
        if (!status.canMoveTo(target)) {
            throw new ConflictException(
                    PortfolioErrorCodes.INVALID_TRANSITION, "A " + status + " project can't become " + target);
        }
        boolean hasReason = reason != null && !reason.isBlank();
        if (ProjectStatus.needsReason(target) && !hasReason) {
            throw new InvalidInputException(
                    FieldViolation.of("reason", PlatformErrorCodes.Field.REQUIRED, "Say why the project is " + target));
        }
        this.status = target;
        this.statusReason = hasReason ? reason.strip() : null;
    }

    /** Moves the caller may request next; {@code APPROVED} is left out because it comes from the charter. */
    public Set<ProjectStatus> manualTransitions() {
        Set<ProjectStatus> next = EnumSet.noneOf(ProjectStatus.class);
        for (ProjectStatus candidate : ProjectStatus.values()) {
            if (candidate != ProjectStatus.APPROVED && status.canMoveTo(candidate)) {
                next.add(candidate);
            }
        }
        return next;
    }

    // ---- Planning ---------------------------------------------------------------------------------------------

    public void rename(String newName) {
        this.name = Objects.requireNonNull(newName).strip();
    }

    public void describe(String newDescription) {
        this.description = newDescription;
    }

    public void assignManager(UUID newManagerId) {
        this.managerId = Objects.requireNonNull(newManagerId);
    }

    public void moveToProgram(UUID newProgramId) {
        this.programId = newProgramId;
    }

    /** The methodology shapes the whole plan (board or schedule), so it is fixed once the project is approved. */
    public void changeMethodology(Methodology newMethodology) {
        if (newMethodology == methodology) {
            return;
        }
        if (status != ProjectStatus.PROPOSED) {
            throw new ConflictException(
                    PortfolioErrorCodes.METHODOLOGY_LOCKED, "The methodology can only change while PROPOSED");
        }
        this.methodology = newMethodology;
    }

    public void reschedule(LocalDate newStartDate, LocalDate newTargetEndDate) {
        Objects.requireNonNull(newStartDate);
        Objects.requireNonNull(newTargetEndDate);
        if (!newTargetEndDate.isAfter(newStartDate)) {
            throw new InvalidInputException(new FieldViolation(
                    "targetEndDate",
                    PlatformErrorCodes.Field.RANGE,
                    "must be after the start date",
                    Map.of("min", newStartDate.plusDays(1).toString())));
        }
        this.startDate = newStartDate;
        this.targetEndDate = newTargetEndDate;
    }

    public void changeBudget(Money budget) {
        if (budget != null && budget.isNegative()) {
            throw new InvalidInputException(
                    FieldViolation.of("budget.amount", PlatformErrorCodes.Field.RANGE, "must not be negative"));
        }
        this.budgetAmount = budget == null ? null : budget.amount();
        this.budgetCurrency = budget == null ? null : budget.currency();
    }

    // ---- Health -----------------------------------------------------------------------------------------------

    /** @return whether the effective health changed */
    public boolean recordComputedHealth(Health health, String reason) {
        Health before = effectiveHealth();
        this.computedHealth = Objects.requireNonNull(health);
        this.computedHealthReason = reason;
        return before != effectiveHealth();
    }

    public void overrideHealth(Health health, String reason) {
        if (health == Health.GREY) {
            throw new InvalidInputException(
                    FieldViolation.of("health", PlatformErrorCodes.Field.INVALID, "GREY is computed, not chosen"));
        }
        if (reason == null || reason.isBlank()) {
            throw new InvalidInputException(
                    FieldViolation.of("reason", PlatformErrorCodes.Field.REQUIRED, "Say why you override"));
        }
        this.healthOverride = health;
        this.healthOverrideReason = reason.strip();
    }

    public void clearHealthOverride() {
        this.healthOverride = null;
        this.healthOverrideReason = null;
    }

    public Health effectiveHealth() {
        return healthOverride != null ? healthOverride : computedHealth;
    }

    public String effectiveHealthReason() {
        return healthOverride != null ? healthOverrideReason : computedHealthReason;
    }

    public boolean isHealthOverridden() {
        return healthOverride != null;
    }

    // ---- Accessors ---------------------------------------------------------------------------------------------

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getPortfolioId() {
        return portfolioId;
    }

    public UUID getProgramId() {
        return programId;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public UUID getManagerId() {
        return managerId;
    }

    public Methodology getMethodology() {
        return methodology;
    }

    public ProjectStatus getStatus() {
        return status;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getTargetEndDate() {
        return targetEndDate;
    }

    public Money getBudget() {
        return budgetAmount == null ? null : new Money(budgetAmount, budgetCurrency);
    }

    public Health getHealthOverride() {
        return healthOverride;
    }

    public String getHealthOverrideReason() {
        return healthOverrideReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
