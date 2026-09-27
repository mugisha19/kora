package com.kora.governance.domain;

import com.kora.governance.GovernanceErrorCodes;
import com.kora.organization.Role;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.TenantId;

/**
 * A request to change a project baseline (feature 14): drafted, analysed, then decided by the approval chain built
 * when it is submitted ({@link ApprovalHandler}). Its lifecycle is {@link ChangeRequestStatus}; the steps and their
 * decisions belong to it and are saved with it.
 */
@Entity
@Table(name = "change_requests")
public class ChangeRequest {

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
    private int revision;

    @Column(nullable = false, updatable = false)
    private String key;

    @Column(nullable = false)
    private String title;

    private String description;

    @Column(nullable = false)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ChangeRequestType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ChangeRequestStatus status;

    @Column(name = "cost_delta_amount")
    private BigDecimal costDeltaAmount;

    @Column(name = "cost_delta_currency")
    private String costDeltaCurrency;

    @Column(name = "schedule_delta_days")
    private Integer scheduleDeltaDays;

    @Column(name = "scope_summary")
    private String scopeSummary;

    @Column(name = "risk_summary")
    private String riskSummary;

    @Column(name = "changes_charter_scope", nullable = false)
    private boolean changesCharterScope;

    @Column(name = "requested_by", nullable = false, updatable = false)
    private UUID requestedBy;

    @Column(name = "issue_id", updatable = false)
    private UUID issueId;

    @Column(name = "previous_revision_id", updatable = false)
    private UUID previousRevisionId;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Eager: every read of a request shows its chain; batched so a page of requests loads them together. */
    @OneToMany(cascade = CascadeType.ALL, fetch = FetchType.EAGER)
    @JoinColumn(name = "change_request_id", nullable = false, updatable = false)
    @OrderBy("position")
    @BatchSize(size = 100)
    private List<ApprovalStep> steps = new ArrayList<>();

    @Version
    private Long version;

    protected ChangeRequest() {
        // for JPA
    }

    public record Impact(
            Money costDelta,
            Integer scheduleDeltaDays,
            String scopeSummary,
            String riskSummary,
            boolean changesCharterScope) {

        public static Impact none() {
            return new Impact(null, null, null, null, false);
        }
    }

    public static ChangeRequest draft(
            UUID organizationId,
            UUID projectId,
            String key,
            int number,
            String title,
            String reason,
            ChangeRequestType type,
            UUID requestedBy,
            UUID issueId,
            Instant now) {
        ChangeRequest request = new ChangeRequest();
        request.id = UUID.randomUUID();
        request.organizationId = Objects.requireNonNull(organizationId);
        request.projectId = Objects.requireNonNull(projectId);
        request.key = Objects.requireNonNull(key);
        request.number = number;
        request.revision = 1;
        request.status = ChangeRequestStatus.DRAFT;
        request.title = Objects.requireNonNull(title).strip();
        request.reason = Objects.requireNonNull(reason).strip();
        request.type = Objects.requireNonNull(type);
        request.requestedBy = Objects.requireNonNull(requestedBy);
        request.issueId = issueId;
        request.createdAt = Objects.requireNonNull(now);
        return request;
    }

    /**
     * A new draft revision of a rejected request: same key, next revision number, same content to rework.
     *
     * @throws ConflictException {@code change_requests.invalid_transition} unless this one was rejected
     */
    public ChangeRequest revise(UUID by, Instant now) {
        if (status != ChangeRequestStatus.REJECTED) {
            throw new ConflictException(
                    GovernanceErrorCodes.CR_INVALID_TRANSITION, "Only a rejected request can be revised");
        }
        ChangeRequest next = draft(organizationId, projectId, key, number, title, reason, type, by, issueId, now);
        next.revision = revision + 1;
        next.previousRevisionId = id;
        next.description = description;
        next.setImpact(impact());
        return next;
    }

    // ---- Draft ---------------------------------------------------------------------------------------------------

    /** Null parameters keep the current value. */
    public void edit(
            String newTitle, String newDescription, String newReason, ChangeRequestType newType, Impact newImpact) {
        ensureDraft("edited");
        if (newTitle != null) {
            this.title = newTitle.strip();
        }
        if (newDescription != null) {
            this.description = newDescription;
        }
        if (newReason != null) {
            this.reason = newReason.strip();
        }
        if (newType != null) {
            this.type = newType;
        }
        if (newImpact != null) {
            setImpact(newImpact);
        }
    }

    public void describe(String newDescription) {
        this.description = newDescription;
    }

    public void setImpact(Impact impact) {
        Money cost = impact.costDelta();
        this.costDeltaAmount = cost == null ? null : cost.amount();
        this.costDeltaCurrency = cost == null ? null : cost.currency();
        this.scheduleDeltaDays = impact.scheduleDeltaDays();
        this.scopeSummary = impact.scopeSummary();
        this.riskSummary = impact.riskSummary();
        this.changesCharterScope = impact.changesCharterScope();
    }

    // ---- Approval ------------------------------------------------------------------------------------------------

    /** Freezes the approval chain: later threshold changes don't move a request already on its way. */
    public void submit(List<ApprovalHandler.StepPlan> chain, Instant now) {
        ensureDraft("submitted");
        this.status = status.moveTo(ChangeRequestStatus.SUBMITTED);
        for (ApprovalHandler.StepPlan plan : chain) {
            steps.add(ApprovalStep.planned(organizationId, steps.size() + 1, plan));
        }
        this.submittedAt = Objects.requireNonNull(now);
    }

    /**
     * Records the current step's decision.
     *
     * @return true when this approval was the last one: the change is approved and must be applied now
     * @throws ConflictException {@code change_requests.not_in_review}, or {@code change_requests.self_approval}
     *     for the requester
     * @throws ForbiddenException when it isn't the caller's step to decide
     */
    public boolean decide(Decision decision, String comment, UUID by, Role role, Instant now) {
        if (!status.inReview()) {
            throw new ConflictException(
                    GovernanceErrorCodes.CR_NOT_IN_REVIEW, "The request isn't waiting for a decision; it is " + status);
        }
        if (by.equals(requestedBy)) {
            throw new ConflictException(
                    GovernanceErrorCodes.CR_SELF_APPROVAL, "Nobody decides on their own change request");
        }
        ApprovalStep step = pendingStep().orElseThrow();
        if (!step.mayBeDecidedBy(by, role, requestedBy)) {
            throw new ForbiddenException("This step waits for "
                    + (step.getApproverId() != null
                            ? "a named approver"
                            : "a member with the " + step.getApproverRole() + " role"));
        }
        if (decision == Decision.REJECT) {
            if (comment == null || comment.isBlank()) {
                throw new InvalidInputException(
                        FieldViolation.of("comment", PlatformErrorCodes.Field.REQUIRED, "say why it is rejected"));
            }
            step.reject(by, comment, now);
            steps.stream().filter(ApprovalStep::isOpen).forEach(ApprovalStep::skip);
            this.status = status.moveTo(ChangeRequestStatus.REJECTED);
            this.decidedAt = now;
            return false;
        }
        step.approve(by, comment, now);
        Optional<ApprovalStep> next = steps.stream()
                .filter(candidate -> candidate.getState() == StepState.WAITING)
                .findFirst();
        if (next.isPresent()) {
            next.get().activate();
            if (status == ChangeRequestStatus.SUBMITTED) {
                this.status = status.moveTo(ChangeRequestStatus.IN_REVIEW);
            }
            return false;
        }
        this.status = status.moveTo(ChangeRequestStatus.APPROVED);
        this.decidedAt = now;
        return true;
    }

    public void withdraw() {
        this.status = status.moveTo(ChangeRequestStatus.WITHDRAWN);
        steps.stream().filter(ApprovalStep::isOpen).forEach(ApprovalStep::skip);
    }

    public void implement() {
        this.status = status.moveTo(ChangeRequestStatus.IMPLEMENTED);
    }

    public Optional<ApprovalStep> pendingStep() {
        return steps.stream()
                .filter(step -> step.getState() == StepState.PENDING)
                .findFirst();
    }

    /** Whether the user may decide the step waiting now (the approval inbox). */
    public boolean awaits(UUID userId, Role role) {
        return status.inReview()
                && !userId.equals(requestedBy)
                && pendingStep()
                        .map(step -> step.mayBeDecidedBy(userId, role, requestedBy))
                        .orElse(false);
    }

    public boolean mayBeEditedBy(UUID userId) {
        return userId.equals(requestedBy);
    }

    private void ensureDraft(String action) {
        if (status != ChangeRequestStatus.DRAFT) {
            throw new ConflictException(
                    GovernanceErrorCodes.CR_NOT_DRAFT, "Only a draft can be " + action + "; this request is " + status);
        }
    }

    public Impact impact() {
        return new Impact(
                costDeltaAmount == null ? null : new Money(costDeltaAmount, costDeltaCurrency),
                scheduleDeltaDays,
                scopeSummary,
                riskSummary,
                changesCharterScope);
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public String getKey() {
        return key;
    }

    public int getRevision() {
        return revision;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getReason() {
        return reason;
    }

    public ChangeRequestType getType() {
        return type;
    }

    public ChangeRequestStatus getStatus() {
        return status;
    }

    public UUID getRequestedBy() {
        return requestedBy;
    }

    public UUID getIssueId() {
        return issueId;
    }

    public UUID getPreviousRevisionId() {
        return previousRevisionId;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public List<ApprovalStep> getSteps() {
        return List.copyOf(steps);
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
