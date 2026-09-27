package com.kora.governance.domain;

import com.kora.governance.GovernanceErrorCodes;
import com.kora.platform.error.ConflictException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A problem happening now (feature 12), unlike a risk, which might happen. Its lifecycle is {@link IssueStatus};
 * resolving it requires saying how.
 */
@Entity
@Table(name = "issues")
public class Issue {

    /** A critical issue unresolved for longer than this needs the PMO. */
    public static final Duration ESCALATE_CRITICAL_AFTER = Duration.ofDays(3);

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
    @Column(nullable = false)
    private IssueType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssuePriority priority;

    /** Maintained by the database from {@link #priority}, for sorting by urgency. */
    @Column(name = "priority_rank", insertable = false, updatable = false)
    private Short priorityRank;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssueStatus status;

    @Column(name = "owner_id")
    private UUID ownerId;

    @Column(name = "raised_by", nullable = false, updatable = false)
    private UUID raisedBy;

    @Column(name = "due_date")
    private LocalDate dueDate;

    private String resolution;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "risk_id", updatable = false)
    private UUID riskId;

    @Column(name = "change_request_id")
    private UUID changeRequestId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Issue() {
        // for JPA
    }

    public static Issue raise(
            UUID organizationId,
            UUID projectId,
            String key,
            int number,
            String title,
            IssueType type,
            IssuePriority priority,
            UUID raisedBy,
            UUID fromRisk,
            Instant now) {
        Issue issue = new Issue();
        issue.id = UUID.randomUUID();
        issue.organizationId = Objects.requireNonNull(organizationId);
        issue.projectId = Objects.requireNonNull(projectId);
        issue.number = number;
        issue.key = Objects.requireNonNull(key);
        issue.retitle(title);
        issue.type = Objects.requireNonNull(type);
        issue.priority = Objects.requireNonNull(priority);
        issue.status = IssueStatus.OPEN;
        issue.raisedBy = Objects.requireNonNull(raisedBy);
        issue.riskId = fromRisk;
        issue.createdAt = Objects.requireNonNull(now);
        return issue;
    }

    public void retitle(String newTitle) {
        ensureEditable();
        this.title = Objects.requireNonNull(newTitle).strip();
    }

    public void describe(String newDescription) {
        ensureEditable();
        this.description = newDescription;
    }

    public void classify(IssueType newType) {
        ensureEditable();
        this.type = Objects.requireNonNull(newType);
    }

    public void prioritize(IssuePriority newPriority) {
        ensureEditable();
        this.priority = Objects.requireNonNull(newPriority);
    }

    public void assignOwner(UUID newOwnerId) {
        ensureEditable();
        this.ownerId = newOwnerId;
    }

    public void dueOn(LocalDate date) {
        ensureEditable();
        this.dueDate = date;
    }

    /** Between OPEN and IN_PROGRESS only; the other moves have their own methods. */
    public void work(IssueStatus target) {
        if (target != IssueStatus.OPEN && target != IssueStatus.IN_PROGRESS) {
            throw new IllegalArgumentException("Resolve, close and reopen have their own operations: " + target);
        }
        if (target != status) {
            this.status = status.moveTo(target);
        }
    }

    public void resolve(String how, Instant now) {
        this.status = status.moveTo(IssueStatus.RESOLVED);
        this.resolution = Objects.requireNonNull(how).strip();
        this.resolvedAt = Objects.requireNonNull(now);
    }

    public void close() {
        this.status = status.moveTo(IssueStatus.CLOSED);
    }

    /** The problem is back: the old resolution no longer holds. */
    public void reopen() {
        this.status = status.moveTo(IssueStatus.OPEN);
        this.resolution = null;
        this.resolvedAt = null;
    }

    public void handledBy(UUID changeRequest) {
        this.changeRequestId = changeRequest;
    }

    /** A resolved or closed issue changes only by reopening it. */
    private void ensureEditable() {
        if (status != null && !status.isUnresolved()) {
            throw new ConflictException(
                    GovernanceErrorCodes.ISSUE_INVALID_TRANSITION,
                    "The issue is " + status + "; reopen it before changing it");
        }
    }

    public boolean isOverdue(LocalDate today) {
        return status.isUnresolved() && dueDate != null && dueDate.isBefore(today);
    }

    public boolean isEscalated(Instant now) {
        return status.isUnresolved()
                && priority == IssuePriority.CRITICAL
                && createdAt.plus(ESCALATE_CRITICAL_AFTER).isBefore(now);
    }

    public boolean mayBeChangedBy(UUID userId) {
        return userId.equals(ownerId);
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

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public IssueType getType() {
        return type;
    }

    public IssuePriority getPriority() {
        return priority;
    }

    public IssueStatus getStatus() {
        return status;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public UUID getRaisedBy() {
        return raisedBy;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public String getResolution() {
        return resolution;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public UUID getRiskId() {
        return riskId;
    }

    public UUID getChangeRequestId() {
        return changeRequestId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
