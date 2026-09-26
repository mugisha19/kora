package com.kora.organization.application;

import com.kora.identity.AccountView;
import com.kora.identity.IssuedSession;
import com.kora.identity.Sessions;
import com.kora.identity.UserAccounts;
import com.kora.identity.UserLocale;
import com.kora.organization.Role;
import com.kora.organization.domain.Membership;
import com.kora.organization.domain.Organization;
import com.kora.organization.domain.Slugs;
import com.kora.platform.ratelimit.RateLimiter;
import com.kora.platform.ratelimit.RateLimits;
import com.kora.platform.tenancy.TenantTransactions;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Creating an organization together with its first administrator, then signing them in (feature 02).
 *
 * <p>Three steps, in three scopes: pick a free slug (system scope, since slugs are unique across organizations),
 * create account, organization and membership in one transaction inside the new organization's scope, and only
 * after that has committed start the session.
 */
@Service
public class RegistrationService {

    public static final String DEFAULT_CURRENCY = "RWF";
    public static final String DEFAULT_TIME_ZONE = "Africa/Kigali";

    private final UserAccounts accounts;
    private final Sessions sessions;
    private final OrganizationRepository organizations;
    private final MembershipRepository memberships;
    private final TenantTransactions transactions;
    private final RateLimiter rateLimiter;
    private final RateLimits limits;
    private final Clock clock;

    RegistrationService(
            UserAccounts accounts,
            Sessions sessions,
            OrganizationRepository organizations,
            MembershipRepository memberships,
            TenantTransactions transactions,
            RateLimiter rateLimiter,
            RateLimits limits,
            Clock clock) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.organizations = organizations;
        this.memberships = memberships;
        this.transactions = transactions;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.clock = clock;
    }

    public IssuedSession register(RegisterOrganization command, String clientAddress) {
        rateLimiter.acquire(limits.named("register-organization-ip", "5/1h"), clientAddress);
        String slug = transactions.readInSystem(() -> freeSlug(command.organizationName()));
        UUID organizationId = UUID.randomUUID();
        UUID userId = transactions.inOrganization(organizationId, () -> create(organizationId, slug, command));
        return sessions.start(userId);
    }

    private UUID create(UUID organizationId, String slug, RegisterOrganization command) {
        Instant now = clock.instant();
        Organization organization = Organization.create(
                organizationId,
                command.organizationName(),
                slug,
                command.currency() == null ? DEFAULT_CURRENCY : command.currency(),
                command.timeZone() == null ? DEFAULT_TIME_ZONE : command.timeZone(),
                now);
        UUID userId = accounts.createAccount(command.email(), command.fullName(), command.password(), UserLocale.EN);
        AccountView account = accounts.get(userId);
        organizations.save(organization);
        memberships.save(
                Membership.join(organizationId, userId, account.email(), account.fullName(), Role.ORG_ADMIN, now));
        return userId;
    }

    private String freeSlug(String organizationName) {
        String base = Slugs.from(organizationName);
        String candidate = base;
        for (int n = 2; organizations.existsBySlug(candidate); n++) {
            candidate = Slugs.alternative(base, n);
        }
        return candidate;
    }

    public record RegisterOrganization(
            String organizationName, String fullName, String email, String password, String currency, String timeZone) {

        @Override
        public String toString() {
            return "RegisterOrganization[organizationName=" + organizationName + ", password=***]";
        }
    }
}
