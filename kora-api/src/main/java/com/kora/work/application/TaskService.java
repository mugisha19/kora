package com.kora.work.application;

import com.kora.organization.CurrentMember;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectParticipation;
import com.kora.portfolio.ProjectRef;
import com.kora.scope.WbsQueries;
import com.kora.work.TaskChanged;
import com.kora.work.WorkErrorCodes;
import com.kora.work.domain.BoardColumn;
import com.kora.work.domain.Rank;
import com.kora.work.domain.ScheduleConstraint;
import com.kora.work.domain.Sprint;
import com.kora.work.domain.Task;
import com.kora.work.domain.TaskComment;
import com.kora.work.domain.TaskPriority;
import com.kora.work.domain.TaskStatus;
import com.kora.work.domain.TaskType;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tasks (feature 08). Who may do what follows {@link ProjectAccess}: the project's managers change any task; its
 * contributors create tasks and change those assigned to them or to nobody; everyone who sees the project reads.
 */
@Service
public class TaskService {

    private static final Logger LOG = LoggerFactory.getLogger(TaskService.class);

    static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by("rank", "createdAt"))
            .allow("rank")
            .allow("key", "number")
            .allow("priority", "priorityRank")
            .allow("dueDate")
            .allow("createdAt");

    private final TaskRepository tasks;
    private final TaskSequenceRepository sequences;
    private final TaskCommentRepository comments;
    private final BoardColumnRepository columns;
    private final SprintRepository sprints;
    private final ProjectAccess projects;
    private final WbsQueries wbs;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    TaskService(
            TaskRepository tasks,
            TaskSequenceRepository sequences,
            TaskCommentRepository comments,
            BoardColumnRepository columns,
            SprintRepository sprints,
            ProjectAccess projects,
            WbsQueries wbs,
            ApplicationEventPublisher events,
            Clock clock) {
        this.tasks = tasks;
        this.sequences = sequences;
        this.comments = comments;
        this.columns = columns;
        this.sprints = sprints;
        this.projects = projects;
        this.wbs = wbs;
        this.events = events;
        this.clock = clock;
    }

    public record NewTask(
            String title,
            String description,
            TaskType type,
            TaskPriority priority,
            TaskStatus status,
            UUID assigneeId,
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
            LocalDate constraintDate) {}

    /** Null fields stay as they are. */
    public record TaskChanges(
            String title,
            String description,
            TaskType type,
            TaskPriority priority,
            UUID assigneeId,
            UUID wbsNodeId,
            Integer storyPoints,
            BigDecimal estimateHours,
            BigDecimal remainingHours,
            LocalDate startDate,
            LocalDate dueDate,
            List<String> labels,
            Integer durationDays,
            ScheduleConstraint scheduleConstraint,
            LocalDate constraintDate) {}

    /**
     * @param afterTaskId the task that ends up directly above
     * @param beforeTaskId the task that ends up directly below
     * @param override move into a column at its WIP limit anyway
     */
    public record Move(TaskStatus status, UUID afterTaskId, UUID beforeTaskId, boolean override, String reason) {}

    @Transactional(readOnly = true)
    public Page<Task> list(TaskSearch search, Pageable pageable) {
        projects.readable(search.projectId());
        return tasks.search(search, SORT.apply(pageable));
    }

    @Transactional(readOnly = true)
    public Task get(UUID taskId) {
        return find(taskId);
    }

    @Transactional
    public Task create(UUID projectId, NewTask command) {
        ProjectParticipation participation = projects.participating(projectId);
        requireAssignee(projectId, command.assigneeId());
        requireWorkPackage(projectId, command.wbsNodeId());
        if (command.sprintId() != null) {
            openSprintOf(projectId, command.sprintId(), "sprintId");
        }
        ProjectRef project = participation.project();
        UUID organizationId = CurrentMember.get().organizationId();
        sequences.createIfAbsent(projectId, organizationId);
        int number = sequences.lockByProjectId(projectId).next();
        String rank = Rank.between(
                tasks.findFirstByProjectIdOrderByRankDesc(projectId)
                        .map(Task::getRank)
                        .orElse(null),
                null);
        Task task = Task.create(
                organizationId,
                projectId,
                project.code(),
                number,
                command.title(),
                command.type(),
                command.status() == null ? TaskStatus.BACKLOG : command.status(),
                rank,
                clock.instant());
        task.describe(command.description());
        if (command.priority() != null) {
            task.prioritize(command.priority());
        }
        task.assign(command.assigneeId());
        task.planUnder(command.wbsNodeId());
        if (command.sprintId() != null) {
            task.joinSprint(command.sprintId());
        }
        task.estimate(command.storyPoints(), command.estimateHours(), command.remainingHours());
        task.schedule(command.startDate(), command.dueDate());
        task.planSchedule(command.durationDays(), command.scheduleConstraint(), command.constraintDate());
        if (command.labels() != null) {
            task.label(command.labels());
        }
        Task saved = tasks.saveAndFlush(task);
        events.publishEvent(new TaskChanged(projectId));
        return saved;
    }

    @Transactional
    public Task update(UUID taskId, long expectedVersion, TaskChanges changes) {
        Task task = find(taskId);
        requireCanChange(task);
        OptimisticLock.check(expectedVersion, task.getVersion());
        if (changes.assigneeId() != null) {
            requireAssignee(task.getProjectId(), changes.assigneeId());
            task.assign(changes.assigneeId());
        }
        if (changes.wbsNodeId() != null) {
            requireWorkPackage(task.getProjectId(), changes.wbsNodeId());
            task.planUnder(changes.wbsNodeId());
        }
        if (changes.title() != null) {
            task.retitle(changes.title());
        }
        if (changes.description() != null) {
            task.describe(changes.description());
        }
        if (changes.type() != null) {
            task.retype(changes.type());
        }
        if (changes.priority() != null) {
            task.prioritize(changes.priority());
        }
        task.estimate(changes.storyPoints(), changes.estimateHours(), changes.remainingHours());
        task.schedule(changes.startDate(), changes.dueDate());
        task.planSchedule(changes.durationDays(), changes.scheduleConstraint(), changes.constraintDate());
        if (changes.labels() != null) {
            task.label(changes.labels());
        }
        Task saved = tasks.saveAndFlush(task);
        events.publishEvent(new TaskChanged(task.getProjectId()));
        return saved;
    }

    @Transactional
    public void delete(UUID taskId) {
        Task task = find(taskId);
        projects.manageable(task.getProjectId());
        tasks.delete(task);
        events.publishEvent(new TaskChanged(task.getProjectId()));
    }

    /**
     * Changes status and position in one step, as a drag and drop does.
     *
     * @throws ConflictException {@code tasks.wip_limit_reached} when the target column is full and there is no
     *     override; the lifecycle's own conflicts otherwise ({@link Task#moveTo})
     */
    @Transactional
    public Task move(UUID taskId, Move move) {
        Task task = find(taskId);
        ProjectParticipation participation = requireCanChange(task);
        TaskStatus from = task.getStatus();
        if (move.status() != from && move.status().isOnBoard()) {
            checkWipLimit(task, move);
        }
        task.moveTo(move.status(), move.reason(), participation.manages(), clock.instant());
        task.placeAt(rankFor(task, move));
        Task saved = tasks.saveAndFlush(task);
        events.publishEvent(new TaskChanged(task.getProjectId()));
        return saved;
    }

    @Transactional(readOnly = true)
    public List<TaskComment> comments(UUID taskId) {
        find(taskId);
        return comments.findByTaskIdOrderByCreatedAtAsc(taskId);
    }

    /** Any manager or contributor may comment on any task of the project. */
    @Transactional
    public TaskComment comment(UUID taskId, String body) {
        Task task = find(taskId);
        projects.participating(task.getProjectId());
        return comments.save(TaskComment.write(
                CurrentMember.get().organizationId(),
                taskId,
                CurrentMember.get().userId(),
                body,
                clock.instant()));
    }

    // ---- Rules ----------------------------------------------------------------------------------------------------

    /** Tasks are found through their tenant-filtered row, then the project decides whether the caller may see it. */
    private Task find(UUID taskId) {
        Task task = tasks.findById(taskId).orElseThrow(() -> NotFoundException.of("Task", taskId));
        projects.readable(task.getProjectId());
        return task;
    }

    private ProjectParticipation requireCanChange(Task task) {
        ProjectParticipation participation = projects.participating(task.getProjectId());
        if (!participation.manages() && !task.isOpenTo(CurrentMember.get().userId())) {
            throw new ForbiddenException("Contributors can only change tasks assigned to them or to nobody");
        }
        return participation;
    }

    private void checkWipLimit(Task task, Move move) {
        BoardColumn column = columns.findByProjectIdAndStatus(task.getProjectId(), move.status())
                .orElse(null);
        if (column == null) {
            return;
        }
        long inColumn = tasks.countByProjectIdAndStatus(task.getProjectId(), move.status());
        if (!column.isFullWith(inColumn)) {
            return;
        }
        if (!move.override()) {
            throw new ConflictException(
                    WorkErrorCodes.WIP_LIMIT_REACHED,
                    "'" + column.getName() + "' is at its WIP limit of " + column.getWipLimit()
                            + "; finish something first, or move it anyway");
        }
        // Recorded until the audit trail arrives (feature 19): overrides are how a WIP limit gets ignored.
        LOG.info(
                "WIP limit override: task {} moved into {} ({} of {}) by user {}",
                task.getKey(),
                move.status(),
                inColumn,
                column.getWipLimit(),
                CurrentMember.get().userId());
    }

    /** A rank between the requested neighbours, or at the bottom when none is given. */
    private String rankFor(Task task, Move move) {
        Task above = neighbour(task, move.afterTaskId(), "afterTaskId");
        Task below = neighbour(task, move.beforeTaskId(), "beforeTaskId");
        if (above == null && below == null) {
            String last = tasks.findFirstByProjectIdOrderByRankDesc(task.getProjectId())
                    .filter(bottom -> !bottom.getId().equals(task.getId()))
                    .map(Task::getRank)
                    .orElse(null);
            return last == null ? task.getRank() : Rank.between(last, null);
        }
        String lower = above != null
                ? above.getRank()
                : tasks.findFirstByProjectIdAndRankLessThanAndIdNotOrderByRankDesc(
                                task.getProjectId(), below.getRank(), task.getId())
                        .map(Task::getRank)
                        .orElse(null);
        String upper = below != null
                ? below.getRank()
                : tasks.findFirstByProjectIdAndRankGreaterThanAndIdNotOrderByRankAsc(
                                task.getProjectId(), above.getRank(), task.getId())
                        .map(Task::getRank)
                        .orElse(null);
        if (upper != null && lower != null && lower.compareTo(upper) >= 0) {
            throw new InvalidInputException(
                    FieldViolation.of("afterTaskId", PlatformErrorCodes.Field.INVALID, "must be above beforeTaskId"));
        }
        return Rank.between(lower, upper);
    }

    private Task neighbour(Task task, UUID neighbourId, String field) {
        if (neighbourId == null) {
            return null;
        }
        return tasks.findById(neighbourId)
                .filter(other -> other.getProjectId().equals(task.getProjectId()))
                .filter(other -> !other.getId().equals(task.getId()))
                .orElseThrow(() -> new InvalidInputException(FieldViolation.of(
                        field, PlatformErrorCodes.Field.INVALID, "must be another task of this project")));
    }

    private void requireAssignee(UUID projectId, UUID assigneeId) {
        if (assigneeId != null && !projects.canWorkOn(projectId, assigneeId)) {
            throw new InvalidInputException(FieldViolation.of(
                    "assigneeId",
                    PlatformErrorCodes.Field.INVALID,
                    "must be the project manager or a contributor on the project team"));
        }
    }

    private void requireWorkPackage(UUID projectId, UUID wbsNodeId) {
        if (wbsNodeId != null && !wbs.isWorkPackage(projectId, wbsNodeId)) {
            throw new InvalidInputException(FieldViolation.of(
                    "wbsNodeId", PlatformErrorCodes.Field.INVALID, "must be a work package of this project's WBS"));
        }
    }

    Sprint openSprintOf(UUID projectId, UUID sprintId, String field) {
        Sprint sprint = sprints.findById(sprintId)
                .filter(candidate -> candidate.getProjectId().equals(projectId))
                .orElseThrow(() -> new InvalidInputException(FieldViolation.of(
                        field, PlatformErrorCodes.Field.INVALID, "must be a sprint of this project")));
        sprint.ensureOpen();
        return sprint;
    }
}
