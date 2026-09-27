package com.kora.scope.domain;

/** Where a node's percent complete comes from; the web app only lets people edit a {@code REPORTED} value. */
public enum PercentCompleteSource {
    /** Entered on a work package that has no tasks. */
    REPORTED,
    /** Derived from the work package's tasks. */
    TASKS,
    /** A deliverable's effort-weighted average of its children. */
    ROLLED_UP
}
