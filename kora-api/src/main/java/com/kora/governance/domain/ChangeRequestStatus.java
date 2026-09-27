package com.kora.governance.domain;

import com.kora.governance.GovernanceErrorCodes;
import com.kora.platform.error.ConflictException;
import java.util.EnumSet;
import java.util.Set;

/**
 * Change request lifecycle as a State pattern (feature 14): {@code DRAFT → SUBMITTED → IN_REVIEW → APPROVED →
 * IMPLEMENTED}, or {@code REJECTED} by any approver; anything not yet decided can be {@code WITHDRAWN}.
 */
public enum ChangeRequestStatus {
    DRAFT {
        @Override
        Set<ChangeRequestStatus> next() {
            return EnumSet.of(SUBMITTED, WITHDRAWN);
        }
    },
    SUBMITTED {
        @Override
        Set<ChangeRequestStatus> next() {
            return EnumSet.of(IN_REVIEW, APPROVED, REJECTED, WITHDRAWN);
        }
    },
    IN_REVIEW {
        @Override
        Set<ChangeRequestStatus> next() {
            return EnumSet.of(APPROVED, REJECTED, WITHDRAWN);
        }
    },
    APPROVED {
        @Override
        Set<ChangeRequestStatus> next() {
            return EnumSet.of(IMPLEMENTED);
        }
    },
    REJECTED,
    WITHDRAWN,
    IMPLEMENTED;

    Set<ChangeRequestStatus> next() {
        return EnumSet.noneOf(ChangeRequestStatus.class);
    }

    /** @throws ConflictException {@code change_requests.invalid_transition} */
    ChangeRequestStatus moveTo(ChangeRequestStatus target) {
        if (!next().contains(target)) {
            throw new ConflictException(
                    GovernanceErrorCodes.CR_INVALID_TRANSITION,
                    "A change request can't go from " + this + " to " + target);
        }
        return target;
    }

    public boolean inReview() {
        return this == SUBMITTED || this == IN_REVIEW;
    }
}
