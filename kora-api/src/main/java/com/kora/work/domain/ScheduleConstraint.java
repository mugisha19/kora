package com.kora.work.domain;

/** When a task may start, besides its dependencies (feature 10). */
public enum ScheduleConstraint {
    /** As soon as its predecessors allow. */
    ASAP,
    /** Not before its constraint date, e.g. when a supplier delivers. */
    START_NO_EARLIER_THAN
}
