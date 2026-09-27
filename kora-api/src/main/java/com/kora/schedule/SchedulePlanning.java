package com.kora.schedule;

import com.kora.portfolio.ProjectRef;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Schedule operations for other modules (change control, feature 14). No access checks: callers have checked the
 * project and are acting on an approved change.
 */
public interface SchedulePlanning {

    /** {@code workingDays} working days after (or before, when negative) {@code date} on the organization calendar. */
    LocalDate shiftByWorkingDays(LocalDate date, int workingDays);

    /**
     * Saves a new baseline of a Predictive or Hybrid project's current schedule.
     *
     * @return false for an Agile project, which has no schedule baseline
     */
    boolean rebaseline(ProjectRef project, UUID savedBy);
}
