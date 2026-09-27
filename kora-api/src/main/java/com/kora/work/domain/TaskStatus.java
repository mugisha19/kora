package com.kora.work.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Task lifecycle as a State pattern (feature 08):
 *
 * <pre>
 * BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE
 *           TODO, IN_PROGRESS ⇄ BLOCKED (with a reason)
 *           steps back: TODO → BACKLOG, IN_PROGRESS → TODO, IN_REVIEW → IN_PROGRESS
 *           DONE → TODO (reopening, managers only)
 * </pre>
 *
 * Each state lists where it may go, so skipping review ({@code IN_PROGRESS → DONE}) can't be expressed.
 */
public enum TaskStatus {
    BACKLOG {
        @Override
        Set<TaskStatus> next() {
            return EnumSet.of(TODO);
        }
    },
    TODO {
        @Override
        Set<TaskStatus> next() {
            return EnumSet.of(BACKLOG, IN_PROGRESS, BLOCKED);
        }
    },
    IN_PROGRESS {
        @Override
        Set<TaskStatus> next() {
            return EnumSet.of(TODO, IN_REVIEW, BLOCKED);
        }
    },
    BLOCKED {
        @Override
        Set<TaskStatus> next() {
            return EnumSet.of(TODO, IN_PROGRESS);
        }
    },
    IN_REVIEW {
        @Override
        Set<TaskStatus> next() {
            return EnumSet.of(IN_PROGRESS, DONE);
        }
    },
    DONE {
        @Override
        Set<TaskStatus> next() {
            return EnumSet.of(TODO);
        }
    };

    /** The board's columns, left to right: every status except the backlog. */
    public static final Set<TaskStatus> BOARD = EnumSet.complementOf(EnumSet.of(BACKLOG));

    abstract Set<TaskStatus> next();

    /** Staying in the same status is always allowed: it is a reorder. */
    public boolean canMoveTo(TaskStatus target) {
        return this == target || next().contains(target);
    }

    public boolean isOnBoard() {
        return this != BACKLOG;
    }
}
