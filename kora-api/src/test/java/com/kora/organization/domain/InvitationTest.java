package com.kora.organization.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.organization.Role;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.GoneException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The invitation lifecycle (State pattern): pending → accepted | revoked | expired, and no way back. */
class InvitationTest {

    private static final Instant NOW = Instant.parse("2026-09-26T10:00:00Z");

    private final Invitation invitation = Invitation.create(
            UUID.randomUUID(), "grace@example.com", Role.MEMBER, "hash", UUID.randomUUID(), "Admin", NOW);

    @Test
    void startsPendingAndExpiresAfterFourteenDays() {
        assertThat(invitation.effectiveStatus(NOW)).isEqualTo(InvitationStatus.PENDING);
        assertThat(invitation.getExpiresAt()).isEqualTo(NOW.plus(Invitation.LIFETIME));
        assertThat(invitation.effectiveStatus(invitation.getExpiresAt().minusSeconds(1)))
                .isEqualTo(InvitationStatus.PENDING);
        assertThat(invitation.effectiveStatus(invitation.getExpiresAt())).isEqualTo(InvitationStatus.EXPIRED);
    }

    @Test
    void canBeAcceptedOnlyOnce() {
        invitation.accept(NOW);

        assertThat(invitation.effectiveStatus(NOW)).isEqualTo(InvitationStatus.ACCEPTED);
        assertThatThrownBy(() -> invitation.accept(NOW))
                .isInstanceOf(GoneException.class)
                .extracting("code")
                .isEqualTo("invitations.already_accepted");
    }

    @Test
    void aRevokedInvitationCantBeAcceptedOrRevokedAgain() {
        invitation.revoke(NOW);

        assertThatThrownBy(() -> invitation.accept(NOW))
                .isInstanceOf(GoneException.class)
                .extracting("code")
                .isEqualTo("invitations.revoked");
        assertThatThrownBy(() -> invitation.revoke(NOW))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("invitations.not_pending");
    }

    @Test
    void anExpiredInvitationIsRefusedBeforeTheJobRecordsIt() {
        Instant later = invitation.getExpiresAt().plusSeconds(1);

        assertThatThrownBy(() -> invitation.accept(later))
                .isInstanceOf(GoneException.class)
                .extracting("code")
                .isEqualTo("invitations.expired");
        assertThatThrownBy(() -> invitation.revoke(later)).isInstanceOf(ConflictException.class);

        invitation.expire(later);
        assertThat(invitation.effectiveStatus(later)).isEqualTo(InvitationStatus.EXPIRED);
    }

    @Test
    void expiringIsANoOpWhileStillValid() {
        invitation.expire(NOW);

        assertThat(invitation.effectiveStatus(NOW)).isEqualTo(InvitationStatus.PENDING);
    }

    @Test
    void finalStatesAllowNoTransition() {
        for (InvitationStatus finalState :
                new InvitationStatus[] {InvitationStatus.ACCEPTED, InvitationStatus.REVOKED, InvitationStatus.EXPIRED
                }) {
            assertThatThrownBy(finalState::accept).isInstanceOf(IllegalStateException.class);
            assertThatThrownBy(finalState::revoke).isInstanceOf(IllegalStateException.class);
            assertThatThrownBy(finalState::expire).isInstanceOf(IllegalStateException.class);
        }
    }
}
