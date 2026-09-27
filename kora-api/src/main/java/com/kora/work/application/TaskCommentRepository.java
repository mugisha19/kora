package com.kora.work.application;

import com.kora.work.domain.TaskComment;
import java.util.List;
import java.util.UUID;

/** Persistence port for task comments. */
public interface TaskCommentRepository {

    List<TaskComment> findByTaskIdOrderByCreatedAtAsc(UUID taskId);

    TaskComment save(TaskComment comment);
}
