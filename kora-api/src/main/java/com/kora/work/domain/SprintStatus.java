package com.kora.work.domain;

/** {@code PLANNED → ACTIVE → CLOSED}, one way only; at most one sprint of a project is active. */
public enum SprintStatus {
    PLANNED,
    ACTIVE,
    CLOSED
}
