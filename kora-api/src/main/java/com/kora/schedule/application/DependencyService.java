package com.kora.schedule.application;

import com.kora.organization.CurrentMember;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import com.kora.schedule.ScheduleErrorCodes;
import com.kora.schedule.domain.Dependency;
import com.kora.schedule.domain.DependencyGraph;
import com.kora.schedule.domain.DependencyType;
import com.kora.work.SchedulableTask;
import com.kora.work.WorkQueries;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Task dependencies (feature 10). A new link is checked against the project's existing links before it is saved, so
 * the stored network never contains a loop.
 */
@Service
public class DependencyService {

    private final DependencyRepository dependencies;
    private final ProjectAccess projects;
    private final WorkQueries work;
    private final Clock clock;

    DependencyService(DependencyRepository dependencies, ProjectAccess projects, WorkQueries work, Clock clock) {
        this.dependencies = dependencies;
        this.projects = projects;
        this.work = work;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Dependency> list(UUID projectId) {
        projects.readable(projectId);
        return dependencies.findByProjectIdOrderByCreatedAtAsc(projectId);
    }

    /**
     * @throws ConflictException {@code schedule.cycle} naming the loop; {@code schedule.dependency_exists};
     *     {@code schedule.not_predictive}
     */
    @Transactional
    public Dependency create(UUID projectId, UUID predecessorId, UUID successorId, DependencyType type, int lagDays) {
        ProjectRef project = projects.manageable(projectId);
        ScheduleRules.requirePredictive(project);
        List<SchedulableTask> tasks = work.schedulable(projectId);
        Map<UUID, SchedulableTask> byId = ScheduleRules.byId(tasks);
        requireTask(byId, predecessorId, "predecessorId");
        requireTask(byId, successorId, "successorId");
        Dependency dependency = Dependency.link(
                CurrentMember.get().organizationId(),
                projectId,
                predecessorId,
                successorId,
                type,
                lagDays,
                clock.instant());
        if (dependencies.existsByPredecessorIdAndSuccessorId(predecessorId, successorId)) {
            throw new ConflictException(ScheduleErrorCodes.DEPENDENCY_EXISTS, "These tasks are already linked");
        }
        List<Dependency> existing = dependencies.findByProjectIdOrderByCreatedAtAsc(projectId);
        new DependencyGraph(
                        byId.keySet(), existing.stream().map(Dependency::asLink).toList())
                .loopClosedBy(predecessorId, successorId)
                .ifPresent(loop -> {
                    throw ScheduleRules.cycle(loop, tasks, "successorId");
                });
        return dependencies.save(dependency);
    }

    @Transactional
    public void delete(UUID dependencyId) {
        Dependency dependency =
                dependencies.findById(dependencyId).orElseThrow(() -> NotFoundException.of("Dependency", dependencyId));
        projects.manageable(dependency.getProjectId());
        dependencies.delete(dependency);
    }

    private static void requireTask(Map<UUID, SchedulableTask> tasks, UUID taskId, String field) {
        if (!tasks.containsKey(taskId)) {
            throw new InvalidInputException(
                    FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, "must be a task of this project"));
        }
    }
}
