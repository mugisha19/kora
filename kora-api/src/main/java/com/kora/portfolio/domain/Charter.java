package com.kora.portfolio.domain;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.platform.persistence.StringListConverter;
import com.kora.portfolio.PortfolioErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * The project charter (PMBOK "Develop Project Charter"): why the project exists, what it must achieve, its
 * boundaries and its sponsor. Approving it authorizes the project. One row per version; an approved version is never
 * edited, it is superseded.
 */
@Entity
@Table(name = "charters")
public class Charter {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "version_number", nullable = false, updatable = false)
    private int versionNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CharterStatus status;

    private String purpose;

    @Column(name = "business_case")
    private String businessCase;

    @Convert(converter = CharterListConverters.Objectives.class)
    @Column(nullable = false)
    private List<CharterObjective> objectives;

    @Convert(converter = StringListConverter.class)
    @Column(name = "in_scope", nullable = false)
    private List<String> inScope;

    @Convert(converter = StringListConverter.class)
    @Column(name = "out_of_scope", nullable = false)
    private List<String> outOfScope;

    @Convert(converter = StringListConverter.class)
    @Column(nullable = false)
    private List<String> assumptions;

    @Convert(converter = StringListConverter.class)
    @Column(name = "project_constraints", nullable = false)
    private List<String> constraints;

    @Convert(converter = StringListConverter.class)
    @Column(name = "high_level_risks", nullable = false)
    private List<String> highLevelRisks;

    @Convert(converter = CharterListConverters.Milestones.class)
    @Column(nullable = false)
    private List<CharterMilestone> milestones;

    @Column(name = "summary_budget_amount")
    private BigDecimal summaryBudgetAmount;

    @Column(name = "summary_budget_currency")
    private String summaryBudgetCurrency;

    @Column(name = "sponsor_id")
    private UUID sponsorId;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "submitted_by")
    private UUID submittedBy;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "return_comment")
    private String returnComment;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Charter() {
        // for JPA
    }

    /** Every project starts with an empty draft, version 1. */
    public static Charter firstDraft(UUID organizationId, UUID projectId, Instant now) {
        Charter charter = new Charter();
        charter.id = UUID.randomUUID();
        charter.organizationId = Objects.requireNonNull(organizationId);
        charter.projectId = Objects.requireNonNull(projectId);
        charter.versionNumber = 1;
        charter.status = CharterStatus.DRAFT;
        charter.createdAt = Objects.requireNonNull(now);
        charter.write(CharterContent.empty());
        return charter;
    }

    /** @throws ConflictException {@code charters.not_draft} unless this is a draft */
    public void replaceContent(CharterContent content) {
        status.ensureEditable();
        write(content);
    }

    /**
     * Sends the draft for approval.
     *
     * @throws ConflictException {@code charters.incomplete} with the missing fields in {@code errors[]}: a charter
     *     can't authorize a project without a purpose, an objective and a sponsor
     */
    public void submit(UUID submitter, Instant now) {
        CharterStatus next = status.submit();
        List<FieldViolation> missing = new ArrayList<>();
        if (purpose == null || purpose.isBlank()) {
            missing.add(FieldViolation.of("purpose", PlatformErrorCodes.Field.REQUIRED, "is required to submit"));
        }
        if (objectives.isEmpty()) {
            missing.add(FieldViolation.of(
                    "objectives", PlatformErrorCodes.Field.REQUIRED, "needs at least one objective to submit"));
        }
        if (sponsorId == null) {
            missing.add(FieldViolation.of("sponsorId", PlatformErrorCodes.Field.REQUIRED, "is required to submit"));
        }
        if (!missing.isEmpty()) {
            throw new ConflictException(
                    PortfolioErrorCodes.CHARTER_INCOMPLETE, "The charter isn't complete enough to submit", missing);
        }
        this.status = next;
        this.submittedAt = now;
        this.submittedBy = submitter;
        this.returnComment = null;
    }

    public void approve(UUID approver, Instant now) {
        this.status = status.approve();
        this.approvedBy = Objects.requireNonNull(approver);
        this.approvedAt = Objects.requireNonNull(now);
    }

    public void returnForChanges(String comment) {
        this.status = status.returnToDraft();
        this.returnComment = Objects.requireNonNull(comment).strip();
        this.submittedAt = null;
        this.submittedBy = null;
    }

    private void write(CharterContent content) {
        this.purpose = content.purpose();
        this.businessCase = content.businessCase();
        this.objectives = content.objectives();
        this.inScope = content.inScope();
        this.outOfScope = content.outOfScope();
        this.assumptions = content.assumptions();
        this.constraints = content.constraints();
        this.highLevelRisks = content.highLevelRisks();
        this.milestones = content.milestones();
        Money budget = content.summaryBudget();
        this.summaryBudgetAmount = budget == null ? null : budget.amount();
        this.summaryBudgetCurrency = budget == null ? null : budget.currency();
        this.sponsorId = content.sponsorId();
    }

    public CharterContent content() {
        return new CharterContent(
                purpose,
                businessCase,
                objectives,
                inScope,
                outOfScope,
                assumptions,
                constraints,
                highLevelRisks,
                milestones,
                summaryBudgetAmount == null ? null : new Money(summaryBudgetAmount, summaryBudgetCurrency),
                sponsorId);
    }

    public UUID getProjectId() {
        return projectId;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public CharterStatus getStatus() {
        return status;
    }

    public UUID getSponsorId() {
        return sponsorId;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public UUID getApprovedBy() {
        return approvedBy;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public String getReturnComment() {
        return returnComment;
    }

    public List<CharterMilestone> getMilestones() {
        return milestones;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
