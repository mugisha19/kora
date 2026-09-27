package com.kora.work.application;

import com.kora.work.domain.SprintDayProgress;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Persistence port for the burndown's daily values. */
public interface SprintDayProgressRepository {

    List<SprintDayProgress> findBySprintId(UUID sprintId);

    /** Stores the day's value, replacing an earlier one of the same day; safe when two changes record at once. */
    void upsert(UUID id, UUID organizationId, UUID sprintId, LocalDate day, int remainingPoints);
}
