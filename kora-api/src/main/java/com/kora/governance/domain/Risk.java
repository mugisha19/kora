package com.kora.governance.domain;

import com.kora.governance.GovernanceErrorCodes;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * An uncertain event that would affect the project's objectives (feature 11), scored by probability × impact.
 * Scores change only through {@link #assess}, which the service records as history, so every re-scoring is traceable.
 */
@Entity
@Table(name = "risks")
public class Risk {

    /** A critical risk without a response plan for longer than this counts against project health. */
    public static final int DAYS_TO_PLAN_A_CRITICAL_RISK = 7;

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false, updatable = false)
    private int number;

    @Column(nullable = false, updatable = false)
    private String key;

    @Column(nullable = false)
    private String title;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private RiskKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiskCategory category;

    @Enumerated(EnumType.STRING)
    private RiskProximity proximity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiskStatus status;

    @Column(nullable = false)
    private short probability;

    @Column(nullable = false)
    private short impact;

    /** Maintained by the database as probability × impact, for filtering and sorting; read {@link #score()}. */
    @Column(insertable = false, updatable = false)
    private Short score;

    @Column(name = "residual_probability")
    private Short residualProbability;

    @Column(name = "residual_impact")
    private Short residualImpact;

    @Column(name = "owner_id")
    private UUID ownerId;

    @Column(name = "identified_by", nullable = false, updatable = false)
    private UUID identifiedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "response_strategy")
    private ResponseStrategy responseStrategy;

    @Column(name = "response_plan")
    private String responsePlan;

    @Column(name = "trigger_conditions")
    private String triggerConditions;

    @Column(name = "review_date")
    private LocalDate reviewDate;

    @Enumerated(EnumType.STRING)
    private RiskClosure closure;

    @Column(name = "closure_note")
    private String closureNote;

    @Column(name = "issue_id")
    private UUID issueId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Risk() {
        // for JPA
    }

    public static Risk raise(
            UUID organizationId,
            UUID projectId,
            String key,
            int number,
            String title,
            RiskKind kind,
            RiskCategory category,
            int probability,
            int impact,
            UUID identifiedBy,
            Instant now) {
        Risk risk = new Risk();
        risk.id = UUID.randomUUID();
        risk.organizationId = Objects.requireNonNull(organizationId);
        risk.projectId = Objects.requireNonNull(projectId);
        risk.number = number;
        risk.key = Objects.requireNonNull(key);
        risk.retitle(title);
        risk.kind = Objects.requireNonNull(kind);
        risk.categorize(category);
        risk.status = RiskStatus.IDENTIFIED;
        risk.probability = scale("probability", probability);
        risk.impact = scale("impact", impact);
        risk.identifiedBy = Objects.requireNonNull(identifiedBy);
        risk.createdAt = Objects.requireNonNull(now);
        return risk;
    }

    // ---- Changes (every one refuses a closed risk) -------------------------------------------------------------

    public void retitle(String newTitle) {
        ensureOpen();
        this.title = Objects.requireNonNull(newTitle).strip();
    }

    public void describe(String newDescription) {
        ensureOpen();
        this.description = newDescription;
    }

    public void categorize(RiskCategory newCategory) {
        ensureOpen();
        this.category = Objects.requireNonNull(newCategory);
    }

    public void expectIn(RiskProximity newProximity) {
        ensureOpen();
        this.proximity = newProximity;
    }

    public void assignOwner(UUID newOwnerId) {
        ensureOpen();
        this.ownerId = newOwnerId;
    }

    public void watchFor(String conditions) {
        ensureOpen();
        this.triggerConditions = conditions;
    }

    public void reviewOn(LocalDate date) {
        ensureOpen();
        this.reviewDate = date;
    }

    /** @throws InvalidInputException when the strategy is for the other kind (no "exploit" for a threat) */
    public void planResponse(ResponseStrategy strategy, String plan) {
        ensureOpen();
        if (strategy != null) {
            if (!strategy.fits(kind)) {
                throw new InvalidInputException(FieldViolation.of(
                        "responseStrategy",
                        PlatformErrorCodes.Field.INVALID,
                        strategy + " is not a response to "
                                + (kind == RiskKind.THREAT ? "a threat" : "an opportunity")));
            }
            this.responseStrategy = strategy;
        }
        if (plan != null) {
            this.responsePlan = plan;
        }
    }

    /** Closing has its own operation; the planned states need a strategy and a plan first. */
    public void moveTo(RiskStatus target) {
        ensureOpen();
        if (target == RiskStatus.CLOSED) {
            throw new InvalidInputException(FieldViolation.of(
                    "status", PlatformErrorCodes.Field.INVALID, "close a risk with its close operation"));
        }
        if (target.needsResponse() && (responseStrategy == null || isBlank(responsePlan))) {
            throw new InvalidInputException(FieldViolation.of(
                    "status", PlatformErrorCodes.Field.INVALID, target + " needs a response strategy and a plan"));
        }
        this.status = target;
    }

    /** New scores; residual ones are what the risk should score once the response works. */
    public void assess(int newProbability, int newImpact, Integer newResidualProbability, Integer newResidualImpact) {
        ensureOpen();
        this.probability = scale("probability", newProbability);
        this.impact = scale("impact", newImpact);
        this.residualProbability =
                newResidualProbability == null ? null : scale("residualProbability", newResidualProbability);
        this.residualImpact = newResidualImpact == null ? null : scale("residualImpact", newResidualImpact);
        if (status == RiskStatus.IDENTIFIED) {
            this.status = RiskStatus.ANALYZED;
        }
    }

    public void close(RiskClosure reason, String note) {
        ensureOpen();
        this.status = RiskStatus.CLOSED;
        this.closure = Objects.requireNonNull(reason);
        this.closureNote = note == null ? null : note.strip();
    }

    /** The risk happened; the issue that tracks it now takes over. */
    public void materializedAs(UUID issue, String note) {
        close(RiskClosure.MATERIALIZED, note);
        this.issueId = Objects.requireNonNull(issue);
    }

    /** @throws ConflictException {@code risks.closed}: a closed risk is history */
    public void ensureOpen() {
        if (status == RiskStatus.CLOSED) {
            throw new ConflictException(GovernanceErrorCodes.RISK_CLOSED, "The risk is closed");
        }
    }

    // ---- Derived values --------------------------------------------------------------------------------------

    public int score() {
        return probability * impact;
    }

    public Severity severity() {
        return Severity.of(score());
    }

    public Integer residualScore() {
        return residualProbability == null || residualImpact == null ? null : residualProbability * residualImpact;
    }

    public boolean isOpen() {
        return status != RiskStatus.CLOSED;
    }

    public boolean isReviewOverdue(LocalDate today) {
        return isOpen() && reviewDate != null && reviewDate.isBefore(today);
    }

    /** An open critical risk past its review, or without a plan a week after it was raised (feature 05 health). */
    public boolean isCriticalAndOverdue(LocalDate today, ZoneId zone) {
        if (!isOpen() || severity() != Severity.CRITICAL) {
            return false;
        }
        LocalDate raised = LocalDate.ofInstant(createdAt, zone);
        boolean unplanned = isBlank(responsePlan)
                && raised.plusDays(DAYS_TO_PLAN_A_CRITICAL_RISK).isBefore(today);
        return isReviewOverdue(today) || unplanned;
    }

    public boolean mayBeChangedBy(UUID userId) {
        return userId.equals(ownerId);
    }

    private static short scale(String field, int value) {
        if (value < 1 || value > 5) {
            throw new InvalidInputException(FieldViolation.of(field, PlatformErrorCodes.Field.RANGE, "must be 1 to 5"));
        }
        return (short) value;
    }

    private static boolean isBlank(String text) {
        return text == null || text.isBlank();
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

    public String getKey() {
        return key;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public RiskKind getKind() {
        return kind;
    }

    public RiskCategory getCategory() {
        return category;
    }

    public RiskProximity getProximity() {
        return proximity;
    }

    public RiskStatus getStatus() {
        return status;
    }

    public int getProbability() {
        return probability;
    }

    public int getImpact() {
        return impact;
    }

    public Integer getResidualProbability() {
        return residualProbability == null ? null : residualProbability.intValue();
    }

    public Integer getResidualImpact() {
        return residualImpact == null ? null : residualImpact.intValue();
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public UUID getIdentifiedBy() {
        return identifiedBy;
    }

    public ResponseStrategy getResponseStrategy() {
        return responseStrategy;
    }

    public String getResponsePlan() {
        return responsePlan;
    }

    public String getTriggerConditions() {
        return triggerConditions;
    }

    public LocalDate getReviewDate() {
        return reviewDate;
    }

    public RiskClosure getClosure() {
        return closure;
    }

    public String getClosureNote() {
        return closureNote;
    }

    public UUID getIssueId() {
        return issueId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
