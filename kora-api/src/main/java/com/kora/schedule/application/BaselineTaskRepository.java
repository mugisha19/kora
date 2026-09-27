package com.kora.schedule.application;

import com.kora.schedule.domain.BaselineTask;
import java.util.List;
import java.util.UUID;

/** Persistence port for the tasks of a baseline. */
public interface BaselineTaskRepository {

    List<BaselineTask> findByBaselineId(UUID baselineId);

    <S extends BaselineTask> List<S> saveAll(Iterable<S> tasks);
}
