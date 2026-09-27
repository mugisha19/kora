package com.kora.governance.domain;

import com.kora.governance.GovernanceErrorCodes;
import com.kora.platform.error.ConflictException;
import java.util.EnumSet;
import java.util.Set;

/**
 * Issue lifecycle as a State pattern (feature 12): {@code OPEN ⇄ IN_PROGRESS → RESOLVED → CLOSED}; a resolved or
 * closed issue can be reopened when the problem comes back.
 */
public enum IssueStatus {
    OPEN {
        @Override
        Set<IssueStatus> next() {
            return EnumSet.of(IN_PROGRESS, RESOLVED);
        }
    },
    IN_PROGRESS {
        @Override
        Set<IssueStatus> next() {
            return EnumSet.of(OPEN, RESOLVED);
        }
    },
    RESOLVED {
        @Override
        Set<IssueStatus> next() {
            return EnumSet.of(CLOSED, OPEN);
        }
    },
    CLOSED {
        @Override
        Set<IssueStatus> next() {
            return EnumSet.of(OPEN);
        }
    };

    abstract Set<IssueStatus> next();

    /** @throws ConflictException {@code issues.invalid_transition} */
    IssueStatus moveTo(IssueStatus target) {
        if (!next().contains(target)) {
            throw new ConflictException(
                    GovernanceErrorCodes.ISSUE_INVALID_TRANSITION, "An issue can't go from " + this + " to " + target);
        }
        return target;
    }

    public boolean isUnresolved() {
        return this == OPEN || this == IN_PROGRESS;
    }
}
