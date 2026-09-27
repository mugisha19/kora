package com.kora.work.application;

import com.kora.scope.WorkPackageProgress;
import com.kora.work.domain.Task;
import com.kora.work.domain.TaskProgressRule;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Feeds task progress into the WBS roll-up (scope's port). No access check: scope checks the project itself. */
@Service
class WorkPackageProgressService implements WorkPackageProgress {

    private final TaskRepository tasks;

    WorkPackageProgressService(TaskRepository tasks) {
        this.tasks = tasks;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, BigDecimal> byWorkPackage(UUID projectId) {
        Map<UUID, List<Task>> byNode = tasks.findByProjectIdAndWbsNodeIdIsNotNull(projectId).stream()
                .collect(Collectors.groupingBy(Task::getWbsNodeId));
        Map<UUID, BigDecimal> progress = new HashMap<>();
        byNode.forEach((nodeId, nodeTasks) -> progress.put(nodeId, TaskProgressRule.percentComplete(nodeTasks)));
        return progress;
    }
}
