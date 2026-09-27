package com.kora.resourcing.domain;

import com.kora.platform.error.ConflictException;
import com.kora.resourcing.ResourcingErrorCodes;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.TenantId;

/**
 * One person's week on one project (feature 15). Each project's managers approve their own part of someone's week,
 * so a person working on two projects has two timesheets that week. Entries change only while it is editable.
 */
@Entity
@Table(name = "timesheets")
public class Timesheet {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "week_start", nullable = false, updatable = false)
    private LocalDate weekStart;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TimesheetStatus status;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    private String comment;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "timesheet_id", nullable = false, updatable = false)
    @OrderBy("date, taskKey")
    @BatchSize(size = 100)
    private List<TimeEntry> entries = new ArrayList<>();

    @Version
    private Long version;

    protected Timesheet() {
        // for JPA
    }

    public static Timesheet open(UUID organizationId, UUID userId, UUID projectId, IsoWeek week) {
        Timesheet sheet = new Timesheet();
        sheet.id = UUID.randomUUID();
        sheet.organizationId = Objects.requireNonNull(organizationId);
        sheet.userId = Objects.requireNonNull(userId);
        sheet.projectId = Objects.requireNonNull(projectId);
        sheet.weekStart = week.monday();
        sheet.status = TimesheetStatus.DRAFT;
        return sheet;
    }

    /** @throws ConflictException {@code timesheets.locked} once submitted or approved */
    public void replaceEntries(Collection<TimeEntry> newEntries) {
        if (!status.isEditable()) {
            throw locked();
        }
        entries.clear();
        entries.addAll(newEntries);
    }

    /** Whether the lines are exactly the ones stored, whatever their order. */
    public boolean hasLines(Collection<TimeEntry.Line> lines) {
        List<TimeEntry.Line> mine =
                new ArrayList<>(entries.stream().map(TimeEntry::line).toList());
        if (mine.size() != lines.size()) {
            return false;
        }
        for (TimeEntry.Line line : lines) {
            if (!mine.remove(line)) {
                return false;
            }
        }
        return true;
    }

    public void submit(Instant now) {
        if (!status.isEditable()) {
            throw locked();
        }
        this.status = TimesheetStatus.SUBMITTED;
        this.submittedAt = Objects.requireNonNull(now);
    }

    public void approve(UUID by, Instant now) {
        decide(TimesheetStatus.APPROVED, by, null, now);
    }

    /** The owner sees the comment and can change and resubmit the week. */
    public void reject(UUID by, String why, Instant now) {
        decide(TimesheetStatus.REJECTED, by, Objects.requireNonNull(why).strip(), now);
    }

    private void decide(TimesheetStatus decision, UUID by, String note, Instant now) {
        if (status != TimesheetStatus.SUBMITTED) {
            throw new ConflictException(
                    ResourcingErrorCodes.NOT_SUBMITTED,
                    "Only a submitted timesheet can be decided; this one is " + status);
        }
        if (by.equals(userId)) {
            throw new ConflictException(ResourcingErrorCodes.SELF_APPROVAL, "Nobody approves their own time");
        }
        this.status = decision;
        this.decidedBy = by;
        this.decidedAt = Objects.requireNonNull(now);
        this.comment = note;
    }

    public BigDecimal totalHours() {
        return entries.stream().map(TimeEntry::getHours).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public boolean isEmpty() {
        return entries.isEmpty();
    }

    private static ConflictException locked() {
        return new ConflictException(
                ResourcingErrorCodes.LOCKED, "The timesheet is submitted or approved; its entries can't change");
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public LocalDate getWeekStart() {
        return weekStart;
    }

    public TimesheetStatus getStatus() {
        return status;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public String getComment() {
        return comment;
    }

    public List<TimeEntry> getEntries() {
        return List.copyOf(entries);
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
