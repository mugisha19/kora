package com.kora.work.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import com.kora.work.TaskChanged;
import com.kora.work.WorkErrorCodes;
import com.kora.work.domain.Burndown;
import com.kora.work.domain.Sprint;
import com.kora.work.domain.SprintStatus;
import com.kora.work.domain.Task;
import com.kora.work.domain.Velocity;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The product backlog and sprints (feature 09), for Agile and Hybrid projects. Only the project's managers plan and
 * run sprints; the team works on the tasks through {@link TaskService}.
 */
@Service
public class SprintService {

    /** Sprints only fit iterative delivery; a Predictive project plans with the schedule instead (Phase 5). */
    private static final Set<String> ITERATIVE = Set.of("AGILE", "HYBRID");

    public static final String BACKLOG = "BACKLOG";

    private final SprintRepository sprints;
    private final TaskRepository tasks;
    private final SprintDayProgressRepository days;
    private final BurndownRecorder recorder;
    private final ProjectAccess projects;
    private final OrganizationTimeZone timeZone;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    SprintService(
            SprintRepository sprints,
            TaskRepository tasks,
            SprintDayProgressRepository days,
            BurndownRecorder recorder,
            ProjectAccess projects,
            OrganizationTimeZone timeZone,
            ApplicationEventPublisher events,
            Clock clock) {
        this.sprints = sprints;
        this.tasks = tasks;
        this.days = days;
        this.recorder = recorder;
        this.projects = projects;
        this.timeZone = timeZone;
        this.events = events;
        this.clock = clock;
    }

    /** A sprint with its current task count and points. */
    public record SprintView(Sprint sprint, long taskCount, long totalPoints) {}

    public record NewSprint(String name, String goal, LocalDate startDate, LocalDate endDate) {}

    public record SprintChanges(String name, String goal, LocalDate startDate, LocalDate endDate) {}

    @Transactional(readOnly = true)
    public Page<Task> backlog(UUID projectId, Pageable pageable) {
        projects.readable(projectId);
        return tasks.search(TaskSearch.backlogOf(projectId), TaskService.SORT.apply(unsorted(pageable)));
    }

    @Transactional(readOnly = true)
    public List<SprintView> list(UUID projectId) {
        projects.readable(projectId);
        Map<UUID, SprintTotals> totals = totals(projectId);
        return sprints.findByProjectIdOrderByStartDateDescCreatedAtDesc(projectId).stream()
                .map(sprint -> view(sprint, totals))
                .toList();
    }

    @Transactional(readOnly = true)
    public SprintView get(UUID sprintId) {
        Sprint sprint = find(sprintId);
        return view(sprint, totals(sprint.getProjectId()));
    }

    @Transactional
    public SprintView create(UUID projectId, NewSprint command) {
        ProjectRef project = projects.manageable(projectId);
        if (!ITERATIVE.contains(project.methodology())) {
            throw new ConflictException(
                    WorkErrorCodes.NOT_AGILE, "Sprints are for Agile and Hybrid projects; this one is Predictive");
        }
        Sprint sprint = sprints.saveAndFlush(Sprint.plan(
                CurrentMember.get().organizationId(),
                projectId,
                command.name(),
                command.goal(),
                command.startDate(),
                command.endDate(),
                clock.instant()));
        return new SprintView(sprint, 0, 0);
    }

    @Transactional
    public SprintView update(UUID sprintId, long expectedVersion, SprintChanges changes) {
        Sprint sprint = find(sprintId);
        projects.manageable(sprint.getProjectId());
        OptimisticLock.check(expectedVersion, sprint.getVersion());
        sprint.ensureOpen();
        if (changes.name() != null) {
            sprint.rename(changes.name());
        }
        if (changes.goal() != null) {
            sprint.setGoal(changes.goal());
        }
        sprint.reschedule(changes.startDate(), changes.endDate());
        sprints.saveAndFlush(sprint);
        return view(sprint, totals(sprint.getProjectId()));
    }

    /** Freezes the commitment: the points in the sprint now are what the team signed up for. */
    @Transactional
    public SprintView start(UUID sprintId) {
        Sprint sprint = find(sprintId);
        projects.manageable(sprint.getProjectId());
        if (sprint.getStatus() == SprintStatus.PLANNED
                && sprints.findFirstByProjectIdAndStatus(sprint.getProjectId(), SprintStatus.ACTIVE)
                        .isPresent()) {
            throw new ConflictException(
                    WorkErrorCodes.ALREADY_ACTIVE, "Another sprint of this project is running; close it first");
        }
        List<Task> planned = tasks.findBySprintId(sprintId);
        sprint.start(planned.stream().mapToInt(Task::points).sum());
        sprints.saveAndFlush(sprint);
        recorder.record(sprint);
        return view(sprint, totals(sprint.getProjectId()));
    }

    /**
     * Records what was completed, then moves every unfinished task to {@code carryOverTo}: a planned sprint of the same
     * project, or {@value #BACKLOG}. Finished tasks stay with the sprint they were finished in.
     */
    @Transactional
    public SprintView close(UUID sprintId, String carryOverTo) {
        Sprint sprint = find(sprintId);
        projects.manageable(sprint.getProjectId());
        Sprint next = carryOverTarget(sprint, carryOverTo);
        List<Task> inSprint = tasks.findBySprintId(sprintId);
        int completed =
                inSprint.stream().filter(Task::isDone).mapToInt(Task::points).sum();
        sprint.close(completed);
        recorder.record(sprint);
        for (Task task : inSprint) {
            if (!task.isDone()) {
                if (next == null) {
                    task.leaveSprint();
                } else {
                    task.joinSprint(next.getId());
                }
            }
        }
        sprints.saveAndFlush(sprint);
        events.publishEvent(new TaskChanged(sprint.getProjectId()));
        return view(sprint, totals(sprint.getProjectId()));
    }

    @Transactional
    public SprintView addTasks(UUID sprintId, Collection<UUID> taskIds) {
        Sprint sprint = find(sprintId);
        projects.manageable(sprint.getProjectId());
        sprint.ensureOpen();
        Set<UUID> wanted = new HashSet<>(taskIds);
        List<Task> found = tasks.findByIdIn(wanted).stream()
                .filter(task -> task.getProjectId().equals(sprint.getProjectId()))
                .toList();
        if (found.size() != wanted.size()) {
            throw new InvalidInputException(FieldViolation.of(
                    "taskIds", PlatformErrorCodes.Field.INVALID, "every task must belong to this sprint's project"));
        }
        found.forEach(task -> task.joinSprint(sprintId));
        events.publishEvent(new TaskChanged(sprint.getProjectId()));
        return view(sprint, totals(sprint.getProjectId()));
    }

    @Transactional
    public void removeTask(UUID sprintId, UUID taskId) {
        Sprint sprint = find(sprintId);
        projects.manageable(sprint.getProjectId());
        sprint.ensureOpen();
        Task task = tasks.findById(taskId)
                .filter(candidate -> sprintId.equals(candidate.getSprintId()))
                .orElseThrow(() -> NotFoundException.of("Task in this sprint", taskId));
        task.leaveSprint();
        events.publishEvent(new TaskChanged(sprint.getProjectId()));
    }

    @Transactional(readOnly = true)
    public Burndown burndown(UUID sprintId) {
        Sprint sprint = find(sprintId);
        int committed = sprint.getCommittedPoints() != null
                ? sprint.getCommittedPoints()
                : tasks.findBySprintId(sprintId).stream().mapToInt(Task::points).sum();
        return Burndown.of(sprint, committed, days.findBySprintId(sprintId), today());
    }

    @Transactional(readOnly = true)
    public Velocity velocity(UUID projectId, int last) {
        projects.readable(projectId);
        List<Sprint> newestFirst = sprints.findByProjectIdAndStatusOrderByEndDateDesc(
                projectId, SprintStatus.CLOSED, PageRequest.of(0, last));
        return Velocity.of(newestFirst.reversed());
    }

    private Sprint find(UUID sprintId) {
        Sprint sprint = sprints.findById(sprintId).orElseThrow(() -> NotFoundException.of("Sprint", sprintId));
        projects.readable(sprint.getProjectId());
        return sprint;
    }

    private Sprint carryOverTarget(Sprint closing, String carryOverTo) {
        if (BACKLOG.equals(carryOverTo)) {
            return null;
        }
        InvalidInputException invalid = new InvalidInputException(FieldViolation.of(
                "carryOverTo",
                PlatformErrorCodes.Field.INVALID,
                "must be BACKLOG or the id of a planned sprint of this project"));
        UUID targetId;
        try {
            targetId = UUID.fromString(carryOverTo);
        } catch (IllegalArgumentException notAnId) {
            throw invalid;
        }
        return sprints.findById(targetId)
                .filter(target -> target.getProjectId().equals(closing.getProjectId()))
                .filter(target -> target.getStatus() == SprintStatus.PLANNED)
                .orElseThrow(() -> invalid);
    }

    private Map<UUID, SprintTotals> totals(UUID projectId) {
        return tasks.sprintTotals(projectId).stream()
                .collect(Collectors.toMap(SprintTotals::sprintId, Function.identity()));
    }

    private static SprintView view(Sprint sprint, Map<UUID, SprintTotals> totals) {
        SprintTotals of = totals.get(sprint.getId());
        return of == null ? new SprintView(sprint, 0, 0) : new SprintView(sprint, of.taskCount(), of.points());
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(timeZone.zone()));
    }

    /** The backlog is always in rank order. */
    private static Pageable unsorted(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }
}
