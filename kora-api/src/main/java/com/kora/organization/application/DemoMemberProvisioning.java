package com.kora.organization.application;

import com.kora.identity.AccountView;
import com.kora.identity.UserAccounts;
import com.kora.organization.MemberProvisioning;
import com.kora.organization.Role;
import com.kora.organization.domain.Membership;
import com.kora.platform.tenancy.TenantTransactions;
import java.time.Clock;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/** {@link MemberProvisioning} for the demo profile: joins the account to the organization directly. */
@Service
@Profile("demo")
class DemoMemberProvisioning implements MemberProvisioning {

    private final MembershipRepository memberships;
    private final UserAccounts accounts;
    private final TenantTransactions transactions;
    private final Clock clock;

    DemoMemberProvisioning(
            MembershipRepository memberships, UserAccounts accounts, TenantTransactions transactions, Clock clock) {
        this.memberships = memberships;
        this.accounts = accounts;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Override
    public void addMember(UUID organizationId, UUID userId, Role role) {
        transactions.inOrganization(organizationId, () -> {
            if (!memberships.existsByUserId(userId)) {
                AccountView account = accounts.get(userId);
                memberships.save(Membership.join(
                        organizationId, userId, account.email(), account.fullName(), role, clock.instant()));
            }
            return null;
        });
    }
}
