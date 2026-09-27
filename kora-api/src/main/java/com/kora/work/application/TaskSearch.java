package com.kora.work.application;

import com.kora.work.domain.TaskStatus;
import com.kora.work.domain.TaskType;
import java.util.UUID;

/**
 * Filters for a project's task list; null means "any".
 *
 * @param backlog only unfinished tasks in no sprint (the product backlog)
 */
public record TaskSearch(
        UUID projectId,
        TaskStatus status,
        UUID assigneeId,
        UUID sprintId,
        TaskType type,
        String label,
        String q,
        boolean backlog) {

    public static TaskSearch backlogOf(UUID projectId) {
        return new TaskSearch(projectId, null, null, null, null, null, null, true);
    }
}
