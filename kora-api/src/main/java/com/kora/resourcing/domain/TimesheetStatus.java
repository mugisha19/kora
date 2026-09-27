package com.kora.resourcing.domain;

/**
 * A project timesheet's lifecycle (feature 15): {@code DRAFT → SUBMITTED → APPROVED}, or {@code REJECTED} back to its
 * owner with a comment. Approved weeks are locked; rejected ones can be edited and submitted again.
 */
public enum TimesheetStatus {
    DRAFT,
    SUBMITTED,
    APPROVED,
    REJECTED;

    public boolean isEditable() {
        return this == DRAFT || this == REJECTED;
    }
}
