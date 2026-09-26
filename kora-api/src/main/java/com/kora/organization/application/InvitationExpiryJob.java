package com.kora.organization.application;

import com.kora.platform.tenancy.TenantTransactions;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Records expiry of stale invitations, so lists filtered by status are accurate. Correctness doesn't depend on it:
 * an invitation past its expiry is already refused when used ({@code Invitation#effectiveStatus}).
 */
@Component
class InvitationExpiryJob {

    private static final Logger LOG = LoggerFactory.getLogger(InvitationExpiryJob.class);

    private final InvitationRepository invitations;
    private final TenantTransactions transactions;
    private final Clock clock;

    InvitationExpiryJob(InvitationRepository invitations, TenantTransactions transactions, Clock clock) {
        this.invitations = invitations;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Scheduled(
            initialDelayString = "${kora.organization.invitation-expiry.initial-delay:PT1M}",
            fixedDelayString = "${kora.organization.invitation-expiry.interval:PT15M}")
    void expireStaleInvitations() {
        int expired = transactions.inSystem(() -> invitations.expirePendingBefore(clock.instant()));
        if (expired > 0) {
            LOG.info("Expired {} stale invitations", expired);
        }
    }
}
