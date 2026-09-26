package com.kora.organization.application;

import com.kora.identity.MembershipDirectory;
import com.kora.identity.MembershipView;
import com.kora.platform.tenancy.TenantTransactions;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Implements identity's {@link MembershipDirectory} port. Listing a user's memberships crosses organizations by
 * nature, so it is one of the few reads that run in the system scope, and only ever for the given user.
 */
@Service
class MembershipDirectoryService implements MembershipDirectory {

    private final MembershipRepository memberships;
    private final TenantTransactions transactions;

    MembershipDirectoryService(MembershipRepository memberships, TenantTransactions transactions) {
        this.memberships = memberships;
        this.transactions = transactions;
    }

    @Override
    public List<MembershipView> membershipsOf(UUID userId) {
        return transactions.readInSystem(() -> memberships.summariesOfUser(userId).stream()
                .map(summary -> new MembershipView(
                        summary.organizationId(),
                        summary.organizationName(),
                        summary.organizationSlug(),
                        summary.role().name()))
                .toList());
    }
}
