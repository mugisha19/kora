package com.kora.organization.domain;

import com.kora.organization.OrganizationErrorCodes;

/**
 * Invitation lifecycle as a State pattern: {@code PENDING → ACCEPTED | REVOKED | EXPIRED}, and nothing leaves a final
 * state. Each state answers the transitions itself, so an illegal move (accepting a revoked invitation) can't be
 * expressed by forgetting an {@code if}.
 */
public enum InvitationStatus {
    PENDING {
        @Override
        InvitationStatus accept() {
            return ACCEPTED;
        }

        @Override
        InvitationStatus revoke() {
            return REVOKED;
        }

        @Override
        InvitationStatus expire() {
            return EXPIRED;
        }

        @Override
        String unusableCode() {
            return null;
        }
    },
    ACCEPTED {
        @Override
        String unusableCode() {
            return OrganizationErrorCodes.INVITATION_ALREADY_ACCEPTED;
        }
    },
    REVOKED {
        @Override
        String unusableCode() {
            return OrganizationErrorCodes.INVITATION_REVOKED;
        }
    },
    EXPIRED {
        @Override
        String unusableCode() {
            return OrganizationErrorCodes.INVITATION_EXPIRED;
        }
    };

    InvitationStatus accept() {
        throw illegal("accept");
    }

    InvitationStatus revoke() {
        throw illegal("revoke");
    }

    InvitationStatus expire() {
        throw illegal("expire");
    }

    /** Why a link in this state can't be used ({@code 410} code), or {@code null} while it can. */
    abstract String unusableCode();

    private IllegalStateException illegal(String transition) {
        return new IllegalStateException("Cannot " + transition + " an invitation that is " + this);
    }
}
