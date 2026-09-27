package com.kora.governance.domain;

/** Where a step of the approval chain is: PENDING is the one deciding now. */
public enum StepState {
    WAITING,
    PENDING,
    APPROVED,
    REJECTED,
    SKIPPED
}
