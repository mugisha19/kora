package com.kora.portfolio.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Project lifecycle as a State pattern (feature 04):
 *
 * <pre>
 * PROPOSED → APPROVED → IN_PROGRESS ⇄ ON_HOLD
 *                       IN_PROGRESS → CLOSING → CLOSED
 * any open state → CANCELLED
 * </pre>
 *
 * Each state lists the states it may move to, so an illegal move (reopening a closed project) can't be expressed.
 */
public enum ProjectStatus {
    PROPOSED {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.of(APPROVED, CANCELLED);
        }
    },
    APPROVED {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.of(IN_PROGRESS, CANCELLED);
        }
    },
    IN_PROGRESS {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.of(ON_HOLD, CLOSING, CANCELLED);
        }
    },
    ON_HOLD {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.of(IN_PROGRESS, CANCELLED);
        }
    },
    CLOSING {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.of(CLOSED, CANCELLED);
        }
    },
    CLOSED {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.noneOf(ProjectStatus.class);
        }
    },
    CANCELLED {
        @Override
        Set<ProjectStatus> next() {
            return EnumSet.noneOf(ProjectStatus.class);
        }
    };

    abstract Set<ProjectStatus> next();

    public boolean canMoveTo(ProjectStatus target) {
        return next().contains(target);
    }

    /** Pausing and cancelling must say why: the people affected will ask. */
    public static boolean needsReason(ProjectStatus target) {
        return target == ON_HOLD || target == CANCELLED;
    }

    /** Work is under way: the states in which schedule and cost performance mean something. */
    public boolean isUnderWay() {
        return this == IN_PROGRESS || this == ON_HOLD || this == CLOSING;
    }
}
