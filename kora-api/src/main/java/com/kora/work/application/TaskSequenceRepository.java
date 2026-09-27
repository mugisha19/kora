package com.kora.work.application;

import com.kora.work.domain.TaskSequence;
import java.util.UUID;

/** Persistence port for task numbers. */
public interface TaskSequenceRepository {

    /** Creates the project's counter at 0 unless it exists; safe when two requests do it at once. */
    void createIfAbsent(UUID projectId, UUID organizationId);

    /** The project's counter, locked until the transaction ends. */
    TaskSequence lockByProjectId(UUID projectId);
}
