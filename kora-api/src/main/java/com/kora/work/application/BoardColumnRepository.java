package com.kora.work.application;

import com.kora.work.domain.BoardColumn;
import com.kora.work.domain.TaskStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for configured board columns. */
public interface BoardColumnRepository {

    List<BoardColumn> findByProjectId(UUID projectId);

    Optional<BoardColumn> findByProjectIdAndStatus(UUID projectId, TaskStatus status);

    BoardColumn save(BoardColumn column);
}
