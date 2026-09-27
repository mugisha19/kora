package com.kora.organization.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.Memberships;
import com.kora.platform.tenancy.TenantTransactions;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * The membership check behind {@code X-Organization-Id}, run once per request by the tenant filter. The lookup itself
 * runs in the requested organization's scope, so even this check can only ever see that organization's rows.
 */
@Service
public class ActiveMemberLookup implements Memberships {

    private final MembershipRepository memberships;
    private final TenantTransactions transactions;

    ActiveMemberLookup(MembershipRepository memberships, TenantTransactions transactions) {
        this.memberships = memberships;
        this.transactions = transactions;
    }

    @Override
    public Optional<ActiveMember> activeMember(UUID organizationId, UUID userId) {
        return find(organizationId, userId);
    }

    public Optional<ActiveMember> find(UUID organizationId, UUID userId) {
        return transactions.readInOrganization(
                organizationId,
                () -> memberships
                        .findByUserId(userId)
                        .map(membership -> new ActiveMember(
                                membership.getOrganizationId(), userId, membership.getId(), membership.getRole())));
    }
}
