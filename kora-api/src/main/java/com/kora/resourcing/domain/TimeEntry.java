package com.kora.resourcing.domain;

import com.kora.platform.audit.NotAudited;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * Hours on one task on one day. The task's key and title are copied, so the time (and what it cost) stays readable
 * after the task is deleted; the entry only loses the link.
 *
 * <p>Not audited: replaced as a week is saved; the timesheet and its decisions are audited.
 */
@NotAudited
@Entity
@Table(name = "time_entries")
public class TimeEntry {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    /** Written through the owning timesheet's join column. */
    @Column(name = "timesheet_id", insertable = false, updatable = false)
    private UUID timesheetId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "task_id", updatable = false)
    private UUID taskId;

    @Column(name = "task_key", nullable = false, updatable = false)
    private String taskKey;

    @Column(name = "task_title", nullable = false, updatable = false)
    private String taskTitle;

    @Column(name = "work_date", nullable = false, updatable = false)
    private LocalDate date;

    @Column(nullable = false, updatable = false)
    private BigDecimal hours;

    @Column(updatable = false)
    private String note;

    @Column(nullable = false, updatable = false)
    private boolean billable;

    protected TimeEntry() {
        // for JPA
    }

    /** What an entry says, for comparing a locked week with what the client sent back. */
    public record Line(UUID taskId, LocalDate date, BigDecimal hours, String note, boolean billable) {

        public Line {
            hours = hours.setScale(2, RoundingMode.UNNECESSARY);
            note = note == null || note.isBlank() ? null : note.strip();
        }
    }

    public static TimeEntry of(
            UUID organizationId, UUID userId, UUID projectId, String taskKey, String taskTitle, Line line) {
        TimeEntry entry = new TimeEntry();
        entry.id = UUID.randomUUID();
        entry.organizationId = Objects.requireNonNull(organizationId);
        entry.userId = Objects.requireNonNull(userId);
        entry.projectId = Objects.requireNonNull(projectId);
        entry.taskId = line.taskId();
        entry.taskKey = Objects.requireNonNull(taskKey);
        entry.taskTitle = Objects.requireNonNull(taskTitle);
        entry.date = line.date();
        entry.hours = line.hours();
        entry.note = line.note();
        entry.billable = line.billable();
        return entry;
    }

    public Line line() {
        return new Line(taskId, date, hours, note, billable);
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

    public UUID getTaskId() {
        return taskId;
    }

    public String getTaskKey() {
        return taskKey;
    }

    public String getTaskTitle() {
        return taskTitle;
    }

    public LocalDate getDate() {
        return date;
    }

    public BigDecimal getHours() {
        return hours;
    }

    public String getNote() {
        return note;
    }

    public boolean isBillable() {
        return billable;
    }
}
