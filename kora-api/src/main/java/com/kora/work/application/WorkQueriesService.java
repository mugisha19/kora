package com.kora.work.application;

import com.kora.work.SchedulableTask;
import com.kora.work.WorkQueries;
import com.kora.work.domain.ScheduleConstraint;
import com.kora.work.domain.Task;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class WorkQueriesService implements WorkQueries {

    private final TaskRepository tasks;

    WorkQueriesService(TaskRepository tasks) {
        this.tasks = tasks;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SchedulableTask> schedulable(UUID projectId) {
        return tasks
                .search(
                        new TaskSearch(projectId, null, null, null, null, null, null, false),
                        Sort.by("rank", "createdAt"))
                .stream()
                .map(task -> new SchedulableTask(
                        task.getId(),
                        task.getKey(),
                        task.getTitle(),
                        task.getStatus().name(),
                        task.getDurationDays(),
                        task.getScheduleConstraint() == ScheduleConstraint.START_NO_EARLIER_THAN
                                ? task.getConstraintDate()
                                : null))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, TaskRef> tasks(Collection<UUID> taskIds) {
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        return tasks.findByIdIn(taskIds).stream()
                .collect(Collectors.toMap(
                        Task::getId,
                        task -> new TaskRef(task.getId(), task.getProjectId(), task.getKey(), task.getTitle())));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, UUID> workPackagesOfTasks(UUID projectId) {
        return tasks.findByProjectIdAndWbsNodeIdIsNotNull(projectId).stream()
                .collect(Collectors.toMap(Task::getId, Task::getWbsNodeId));
    }

    @Override
    @Transactional(readOnly = true)
    public StoryPoints storyPoints(UUID projectId) {
        List<Task> all =
                tasks.search(new TaskSearch(projectId, null, null, null, null, null, null, false), Sort.unsorted());
        int done = all.stream().filter(Task::isDone).mapToInt(Task::points).sum();
        int total = all.stream().mapToInt(Task::points).sum();
        return new StoryPoints(done, total);
    }
}
