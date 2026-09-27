package com.kora.work.adapter.web;

import com.kora.platform.web.UserRefJson;
import com.kora.work.domain.ScheduleConstraint;
import com.kora.work.domain.SprintStatus;
import com.kora.work.domain.TaskPriority;
import com.kora.work.domain.TaskStatus;
import com.kora.work.domain.TaskType;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request and response bodies of the contract tags {@code Tasks} and {@code Sprints}. */
final class WorkDtos {

    /** A letter or digit, then up to 29 letters, digits, spaces, underscores or hyphens. */
    static final String LABEL = "[\\p{L}\\p{N}][\\p{L}\\p{N} _-]{0,29}";

    private WorkDtos() {}

    // ---- Tasks ----------------------------------------------------------------------------------------------------

    record TaskResponse(
            UUID id,
            String key,
            UUID projectId,
            String title,
            String description,
            TaskType type,
            TaskPriority priority,
            TaskStatus status,
            String blockedReason,
            UserRefJson assignee,
            UUID wbsNodeId,
            UUID sprintId,
            Integer storyPoints,
            BigDecimal estimateHours,
            BigDecimal remainingHours,
            LocalDate startDate,
            LocalDate dueDate,
            List<String> labels,
            Integer durationDays,
            ScheduleConstraint scheduleConstraint,
            LocalDate constraintDate,
            String rank,
            Instant createdAt,
            Instant completedAt,
            long version) {}

    record CreateTaskRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 10000) String description,
            @NotNull TaskType type,
            TaskPriority priority,
            TaskStatus status,
            UUID assigneeId,
            UUID wbsNodeId,
            UUID sprintId,
            @Min(0) @Max(100) Integer storyPoints,
            @DecimalMin("0") @DecimalMax("10000") BigDecimal estimateHours,
            @DecimalMin("0") @DecimalMax("10000") BigDecimal remainingHours,
            LocalDate startDate,
            LocalDate dueDate,
            @Size(max = 10) List<@NotNull @Pattern(regexp = LABEL) String> labels,
            @Min(0) @Max(1000) Integer durationDays,
            ScheduleConstraint scheduleConstraint,
            LocalDate constraintDate) {}

    record UpdateTaskRequest(
            @Size(min = 1, max = 200) String title,
            @Size(max = 10000) String description,
            TaskType type,
            TaskPriority priority,
            UUID assigneeId,
            UUID wbsNodeId,
            @Min(0) @Max(100) Integer storyPoints,
            @DecimalMin("0") @DecimalMax("10000") BigDecimal estimateHours,
            @DecimalMin("0") @DecimalMax("10000") BigDecimal remainingHours,
            LocalDate startDate,
            LocalDate dueDate,
            @Size(max = 10) List<@NotNull @Pattern(regexp = LABEL) String> labels,
            @Min(0) @Max(1000) Integer durationDays,
            ScheduleConstraint scheduleConstraint,
            LocalDate constraintDate) {}

    record MoveTaskRequest(
            @NotNull TaskStatus status,
            UUID afterTaskId,
            UUID beforeTaskId,
            Boolean override,
            @Size(max = 500) String reason) {}

    record TaskCommentResponse(UUID id, UserRefJson author, String body, Instant createdAt) {}

    record CreateTaskCommentRequest(
            @NotBlank @Size(max = 5000) String body) {}

    // ---- Board ----------------------------------------------------------------------------------------------------

    /** The column's status is in the path; one in the body is accepted (the contract shares the schema) and ignored. */
    record BoardColumnSettings(
            TaskStatus status,
            @NotBlank @Size(max = 40) String name,
            @Min(1) @Max(100) Integer wipLimit) {}

    record BoardColumnResponse(
            TaskStatus status,
            String name,
            Integer wipLimit,
            long taskCount,
            boolean atLimit,
            List<TaskResponse> tasks) {}

    record BoardResponse(UUID projectId, UUID sprintId, List<BoardColumnResponse> columns) {}

    // ---- Sprints --------------------------------------------------------------------------------------------------

    record SprintResponse(
            UUID id,
            UUID projectId,
            String name,
            String goal,
            LocalDate startDate,
            LocalDate endDate,
            SprintStatus status,
            long taskCount,
            long totalPoints,
            Integer committedPoints,
            Integer completedPoints,
            long version) {}

    record CreateSprintRequest(
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String goal,
            @NotNull LocalDate startDate,
            @NotNull LocalDate endDate) {}

    record UpdateSprintRequest(
            @Size(min = 1, max = 100) String name,
            @Size(max = 500) String goal,
            LocalDate startDate,
            LocalDate endDate) {}

    record CloseSprintRequest(@NotBlank String carryOverTo) {}

    record SprintTasksRequest(@NotEmpty @Size(max = 200) List<@NotNull UUID> taskIds) {}

    record BurndownDayResponse(LocalDate date, BigDecimal idealRemaining, Integer actualRemaining) {}

    record BurndownResponse(
            UUID sprintId,
            LocalDate startDate,
            LocalDate endDate,
            int committedPoints,
            List<BurndownDayResponse> days) {}

    record VelocitySprintResponse(
            UUID sprintId, String name, LocalDate endDate, int committedPoints, int completedPoints) {}

    record VelocityResponse(List<VelocitySprintResponse> sprints, BigDecimal average, Integer low, Integer high) {}
}
