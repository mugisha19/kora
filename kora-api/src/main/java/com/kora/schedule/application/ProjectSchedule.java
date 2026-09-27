package com.kora.schedule.application;

import com.kora.schedule.domain.Baseline;
import com.kora.work.SchedulableTask;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A project's computed schedule in dates, ready to show.
 *
 * @param projectFinish null without tasks
 * @param baseline the latest baseline, or null
 */
public record ProjectSchedule(
        UUID projectId, LocalDate projectStart, LocalDate projectFinish, Baseline baseline, List<Row> tasks) {

    /** Variances are in working days, positive when later than the baseline; null without a baseline entry. */
    public record Row(
            SchedulableTask task,
            int durationDays,
            LocalDate earlyStart,
            LocalDate earlyFinish,
            LocalDate lateStart,
            LocalDate lateFinish,
            int totalFloat,
            int freeFloat,
            boolean critical,
            LocalDate baselineStart,
            LocalDate baselineFinish,
            Integer startVariance,
            Integer finishVariance) {}

    public List<UUID> criticalPath() {
        return tasks.stream().filter(Row::critical).map(row -> row.task().id()).toList();
    }
}
