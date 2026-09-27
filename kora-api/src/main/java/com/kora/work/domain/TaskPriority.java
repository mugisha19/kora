package com.kora.work.domain;

/** Declared from lowest to highest; the database sorts by the same order ({@code tasks.priority_rank}). */
public enum TaskPriority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}
