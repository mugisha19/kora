package com.kora.work.domain;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.persistence.StringListConverter;
import com.kora.work.WorkErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A unit of work on a project (feature 08). Its status only changes through {@link #moveTo}, which enforces the
 * {@link TaskStatus} lifecycle; its position is a lexorank key ({@link Rank}).
 */
@Entity
@Table(name = "tasks")
public class Task {

    public static final int MAX_LABELS = 10;

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false, updatable = false)
    private int number;

    /** The project code and number ({@code AKG-12-34}); project codes never change, so it is stored. */
    @Column(nullable = false, updatable = false)
    private String key;

    @Column(nullable = false)
    private String title;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskPriority priority;

    /** Maintained by the database from {@link #priority}, for sorting by severity. */
    @Column(name = "priority_rank", insertable = false, updatable = false)
    private Short priorityRank;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskStatus status;

    @Column(name = "blocked_reason")
    private String blockedReason;

    @Column(name = "assignee_id")
    private UUID assigneeId;

    @Column(name = "wbs_node_id")
    private UUID wbsNodeId;

    @Column(name = "sprint_id")
    private UUID sprintId;

    @Column(name = "story_points")
    private Integer storyPoints;

    @Column(name = "estimate_hours")
    private BigDecimal estimateHours;

    @Column(name = "remaining_hours")
    private BigDecimal remainingHours;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    /** Working days, for the schedule (feature 10); 0 is a milestone. */
    @Column(name = "duration_days")
    private Integer durationDays;

    @Enumerated(EnumType.STRING)
    @Column(name = "schedule_constraint", nullable = false)
    private ScheduleConstraint scheduleConstraint;

    @Column(name = "constraint_date")
    private LocalDate constraintDate;

    @Convert(converter = StringListConverter.class)
    @Column(nullable = false)
    private List<String> labels;

    /** The same column as JSON text, read-only, so the label filter can match it with LIKE. */
    @Column(name = "labels", insertable = false, updatable = false)
    private String labelsJson;

    @Column(nullable = false)
    private String rank;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Version
    private Long version;

    protected Task() {
        // for JPA
    }

    public static Task create(
            UUID organizationId,
            UUID projectId,
            String projectCode,
            int number,
            String title,
            TaskType type,
            TaskStatus status,
            String rank,
            Instant now) {
        if (status != TaskStatus.BACKLOG && status != TaskStatus.TODO) {
            throw new InvalidInputException(FieldViolation.of(
                    "status", PlatformErrorCodes.Field.INVALID, "a new task starts in BACKLOG or TODO"));
        }
        Task task = new Task();
        task.id = UUID.randomUUID();
        task.organizationId = Objects.requireNonNull(organizationId);
        task.projectId = Objects.requireNonNull(projectId);
        task.number = number;
        task.key = projectCode + "-" + number;
        task.retitle(title);
        task.type = Objects.requireNonNull(type);
        task.priority = TaskPriority.MEDIUM;
        task.status = status;
        task.labels = List.of();
        task.scheduleConstraint = ScheduleConstraint.ASAP;
        task.rank = Objects.requireNonNull(rank);
        task.createdAt = Objects.requireNonNull(now);
        return task;
    }

    // ---- Details --------------------------------------------------------------------------------------------------

    public void retitle(String newTitle) {
        this.title = Objects.requireNonNull(newTitle).strip();
    }

    /** Markdown, stored as written; clients render it as Markdown without raw HTML (feature 08). */
    public void describe(String newDescription) {
        this.description = newDescription;
    }

    public void retype(TaskType newType) {
        this.type = Objects.requireNonNull(newType);
    }

    public void prioritize(TaskPriority newPriority) {
        this.priority = Objects.requireNonNull(newPriority);
    }

    public void assign(UUID userId) {
        this.assigneeId = userId;
    }

    public void planUnder(UUID workPackageId) {
        this.wbsNodeId = workPackageId;
    }

    public void estimate(Integer points, BigDecimal estimate, BigDecimal remaining) {
        if (points != null) {
            this.storyPoints = points;
        }
        if (estimate != null) {
            this.estimateHours = estimate.setScale(2, RoundingMode.HALF_EVEN);
        }
        if (remaining != null) {
            this.remainingHours = remaining.setScale(2, RoundingMode.HALF_EVEN);
        }
    }

    /**
     * Planning for the schedule; null parameters leave the value as it is. Switching to {@code ASAP} forgets the date;
     * {@code START_NO_EARLIER_THAN} needs one, given now or kept from before.
     */
    public void planSchedule(Integer duration, ScheduleConstraint constraint, LocalDate date) {
        if (duration != null) {
            this.durationDays = duration;
        }
        ScheduleConstraint newConstraint = constraint != null ? constraint : scheduleConstraint;
        if (newConstraint == ScheduleConstraint.ASAP) {
            this.scheduleConstraint = ScheduleConstraint.ASAP;
            this.constraintDate = null;
            return;
        }
        LocalDate newDate = date != null ? date : constraintDate;
        if (newDate == null) {
            throw new InvalidInputException(FieldViolation.of(
                    "constraintDate", PlatformErrorCodes.Field.REQUIRED, "START_NO_EARLIER_THAN needs a date"));
        }
        this.scheduleConstraint = newConstraint;
        this.constraintDate = newDate;
    }

    public void schedule(LocalDate start, LocalDate due) {
        LocalDate newStart = start != null ? start : startDate;
        LocalDate newDue = due != null ? due : dueDate;
        if (newStart != null && newDue != null && newDue.isBefore(newStart)) {
            throw new InvalidInputException(FieldViolation.of(
                    "dueDate", PlatformErrorCodes.Field.INVALID, "must not be before the start date"));
        }
        this.startDate = newStart;
        this.dueDate = newDue;
    }

    /** Trimmed, duplicates removed (keeping the first), at most {@value #MAX_LABELS}. */
    public void label(List<String> newLabels) {
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        newLabels.forEach(label -> distinct.add(label.strip()));
        if (distinct.size() > MAX_LABELS) {
            throw new InvalidInputException(
                    FieldViolation.of("labels", PlatformErrorCodes.Field.RANGE, "at most " + MAX_LABELS + " labels"));
        }
        this.labels = List.copyOf(new ArrayList<>(distinct));
    }

    // ---- Lifecycle ------------------------------------------------------------------------------------------------

    /**
     * Changes the status. Staying put is a reorder and always allowed.
     *
     * @param manages whether the caller manages the project: only managers reopen finished work
     * @throws ConflictException {@code tasks.invalid_transition} for a move the lifecycle doesn't allow;
     *     {@code tasks.remaining_work} when finishing a task that still has remaining hours
     * @throws InvalidInputException when blocking without a reason
     */
    public void moveTo(TaskStatus target, String reason, boolean manages, Instant now) {
        if (target == status) {
            return;
        }
        if (!status.canMoveTo(target)) {
            throw new ConflictException(
                    WorkErrorCodes.INVALID_TRANSITION, "A task can't move from " + status + " to " + target);
        }
        if (status == TaskStatus.DONE && !manages) {
            throw new ForbiddenException("Only the project's managers can reopen a finished task");
        }
        boolean hasReason = reason != null && !reason.isBlank();
        if (target == TaskStatus.BLOCKED && !hasReason) {
            throw new InvalidInputException(
                    FieldViolation.of("reason", PlatformErrorCodes.Field.REQUIRED, "Say what blocks the task"));
        }
        if (target == TaskStatus.DONE && remainingHours != null && remainingHours.signum() > 0) {
            throw new ConflictException(
                    WorkErrorCodes.REMAINING_WORK,
                    "The task still has " + remainingHours.stripTrailingZeros().toPlainString()
                            + " remaining hours; set them to 0 before finishing it");
        }
        this.status = target;
        this.blockedReason = target == TaskStatus.BLOCKED ? reason.strip() : null;
        this.completedAt = target == TaskStatus.DONE ? now : null;
    }

    public void placeAt(String newRank) {
        this.rank = Objects.requireNonNull(newRank);
    }

    public void joinSprint(UUID newSprintId) {
        this.sprintId = Objects.requireNonNull(newSprintId);
    }

    public void leaveSprint() {
        this.sprintId = null;
    }

    public boolean isDone() {
        return status == TaskStatus.DONE;
    }

    /** Contributors may only change tasks that are theirs or nobody's yet. */
    public boolean isOpenTo(UUID userId) {
        return assigneeId == null || assigneeId.equals(userId);
    }

    public int points() {
        return storyPoints == null ? 0 : storyPoints;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public int getNumber() {
        return number;
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

    public TaskType getType() {
        return type;
    }

    public TaskPriority getPriority() {
        return priority;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public String getBlockedReason() {
        return blockedReason;
    }

    public UUID getAssigneeId() {
        return assigneeId;
    }

    public UUID getWbsNodeId() {
        return wbsNodeId;
    }

    public UUID getSprintId() {
        return sprintId;
    }

    public Integer getStoryPoints() {
        return storyPoints;
    }

    public BigDecimal getEstimateHours() {
        return estimateHours;
    }

    public BigDecimal getRemainingHours() {
        return remainingHours;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public Integer getDurationDays() {
        return durationDays;
    }

    public ScheduleConstraint getScheduleConstraint() {
        return scheduleConstraint;
    }

    public LocalDate getConstraintDate() {
        return constraintDate;
    }

    public List<String> getLabels() {
        return labels;
    }

    public String getRank() {
        return rank;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
