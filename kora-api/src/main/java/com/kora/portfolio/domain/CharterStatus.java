package com.kora.portfolio.domain;

import com.kora.platform.error.ConflictException;
import com.kora.portfolio.PortfolioErrorCodes;

/**
 * Charter lifecycle as a State pattern (feature 06): {@code DRAFT → SUBMITTED → APPROVED → SUPERSEDED}, and a
 * submitted charter can be returned to {@code DRAFT}. Only a draft can be edited.
 */
public enum CharterStatus {
    DRAFT {
        @Override
        CharterStatus submit() {
            return SUBMITTED;
        }

        @Override
        void ensureEditable() {
            // a draft is the only editable state
        }
    },
    SUBMITTED {
        @Override
        CharterStatus approve() {
            return APPROVED;
        }

        @Override
        CharterStatus returnToDraft() {
            return DRAFT;
        }
    },
    APPROVED {
        @Override
        CharterStatus supersede() {
            return SUPERSEDED;
        }
    },
    SUPERSEDED;

    void ensureEditable() {
        throw new ConflictException(
                PortfolioErrorCodes.CHARTER_NOT_DRAFT,
                "Only a draft charter can be edited; an approved charter changes through a change request");
    }

    CharterStatus submit() {
        throw new ConflictException(PortfolioErrorCodes.CHARTER_NOT_DRAFT, "Only a draft charter can be submitted");
    }

    CharterStatus approve() {
        throw notSubmitted();
    }

    CharterStatus returnToDraft() {
        throw notSubmitted();
    }

    CharterStatus supersede() {
        throw new IllegalStateException("Only an approved charter can be superseded");
    }

    private static ConflictException notSubmitted() {
        return new ConflictException(
                PortfolioErrorCodes.CHARTER_NOT_SUBMITTED, "The charter isn't waiting for approval");
    }
}
