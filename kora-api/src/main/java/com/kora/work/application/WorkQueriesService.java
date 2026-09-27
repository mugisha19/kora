package com.kora.work.application;

import com.kora.work.SchedulableTask;
import com.kora.work.WorkQueries;
import com.kora.work.domain.ScheduleConstraint;
import java.util.List;
import java.util.UUID;
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
}
