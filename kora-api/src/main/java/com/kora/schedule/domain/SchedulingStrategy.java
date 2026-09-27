package com.kora.schedule.domain;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Strategy pattern (feature 10): how a network of activities becomes dates. Times are working-day numbers from the
 * project start (day 0), so the calculation knows nothing about weekends or holidays; {@link WorkingDays} maps
 * them to dates afterwards.
 */
public interface SchedulingStrategy {

    /**
     * @throws CyclicDependencyException when the links form a loop
     */
    Schedule schedule(List<Activity> activities, List<Link> links);

    /**
     * @param duration working days; 0 is a milestone
     * @param notBefore the earliest day it may start (0 without a constraint)
     */
    record Activity(UUID id, int duration, int notBefore) {}

    record Link(UUID predecessor, UUID successor, DependencyType type, int lag) {}

    /**
     * Start days are the first working day of the activity; finish days are exclusive (the day after its last
     * working day), so {@code finish = start + duration}.
     */
    record Timing(int earlyStart, int earlyFinish, int lateStart, int lateFinish, int totalFloat, int freeFloat) {

        public boolean critical() {
            return totalFloat <= 0;
        }
    }

    /**
     * @param order the activities by early start, input order breaking ties
     * @param finish the project's finish day (exclusive)
     */
    record Schedule(Map<UUID, Timing> timings, List<UUID> order, int finish) {}
}
