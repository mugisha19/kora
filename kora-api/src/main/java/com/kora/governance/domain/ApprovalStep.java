package com.kora.governance.domain;

import com.kora.organization.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * One level of a change request's approval chain: a named person or anyone holding a role decides. A decision is
 * final; the step is never changed after it.
 */
@Entity
@Table(name = "approval_steps")
public class ApprovalStep {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    /** Written through the owning request's join column. */
    @Column(name = "change_request_id", insertable = false, updatable = false)
    private UUID changeRequestId;

    @Column(nullable = false, updatable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ApprovalLevel level;

    @Column(nullable = false, updatable = false)
    private String reason;

    @Column(name = "approver_id", updatable = false)
    private UUID approverId;

    @Enumerated(EnumType.STRING)
    @Column(name = "approver_role", updatable = false)
    private Role approverRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepState state;

    @Column(name = "decided_by")
    private UUID decidedBy;

    private String comment;

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected ApprovalStep() {
        // for JPA
    }

    static ApprovalStep planned(UUID organizationId, int position, ApprovalHandler.StepPlan plan) {
        ApprovalStep step = new ApprovalStep();
        step.id = UUID.randomUUID();
        step.organizationId = Objects.requireNonNull(organizationId);
        step.position = position;
        step.level = plan.level();
        step.reason = plan.reason();
        step.approverId = plan.approverId();
        step.approverRole = plan.approverRole();
        step.state = position == 1 ? StepState.PENDING : StepState.WAITING;
        return step;
    }

    /**
     * The named approver, or anyone with the role other than the requester; an {@code ORG_ADMIN} may stand in for the
     * PMO, so an organization without a PMO can still decide.
     */
    public boolean mayBeDecidedBy(UUID userId, Role role, UUID requesterId) {
        if (approverId != null) {
            return approverId.equals(userId);
        }
        if (userId.equals(requesterId)) {
            return false;
        }
        return role == approverRole || (approverRole == Role.PMO && role == Role.ORG_ADMIN);
    }

    void approve(UUID by, String note, Instant now) {
        decide(StepState.APPROVED, by, note, now);
    }

    void reject(UUID by, String note, Instant now) {
        decide(StepState.REJECTED, by, note, now);
    }

    void activate() {
        this.state = StepState.PENDING;
    }

    void skip() {
        this.state = StepState.SKIPPED;
    }

    private void decide(StepState decision, UUID by, String note, Instant now) {
        this.state = decision;
        this.decidedBy = Objects.requireNonNull(by);
        this.comment = note == null || note.isBlank() ? null : note.strip();
        this.decidedAt = Objects.requireNonNull(now);
    }

    public boolean isOpen() {
        return state == StepState.PENDING || state == StepState.WAITING;
    }

    public UUID getId() {
        return id;
    }

    public int getPosition() {
        return position;
    }

    public ApprovalLevel getLevel() {
        return level;
    }

    public String getReason() {
        return reason;
    }

    public UUID getApproverId() {
        return approverId;
    }

    public Role getApproverRole() {
        return approverRole;
    }

    public StepState getState() {
        return state;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }

    public String getComment() {
        return comment;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }
}
