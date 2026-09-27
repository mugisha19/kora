package com.kora.schedule;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Read access for other modules (earned value, health, capacity). No access check: callers work in the tenant scope. */
public interface ScheduleQueries {

    /** Each task's dates in the project's latest baseline; empty without a baseline. */
    Map<UUID, DateRange> baselineWindows(UUID projectId);

    /**
     * The last early finish of the project's tasks by the critical path method: when the schedule says it will be
     * done. Empty without tasks, or while the dependencies form a loop.
     */
    Optional<LocalDate> forecastFinish(UUID projectId, LocalDate projectStart);

    /** The organization's working days and holidays, for capacity. */
    WorkingWeek workingWeek();

    record DateRange(LocalDate start, LocalDate finish) {}

    record WorkingWeek(Set<DayOfWeek> workingDays, Set<LocalDate> holidays) {

        public WorkingWeek {
            workingDays = Set.copyOf(workingDays);
            holidays = Set.copyOf(holidays);
        }

        public boolean isWorkingDay(LocalDate date) {
            return workingDays.contains(date.getDayOfWeek()) && !holidays.contains(date);
        }
    }
}
