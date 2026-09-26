package com.kora.organization.application;

import com.kora.identity.AccountView;
import com.kora.identity.IssuedSession;
import com.kora.identity.Sessions;
import com.kora.identity.UserAccounts;
import com.kora.identity.UserLocale;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationErrorCodes;
import com.kora.organization.Role;
import com.kora.organization.domain.Invitation;
import com.kora.organization.domain.InvitationStatus;
import com.kora.organization.domain.Membership;
import com.kora.organization.domain.Organization;
import com.kora.platform.crypto.OpaqueTokens;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.ratelimit.RateLimiter;
import com.kora.platform.ratelimit.RateLimits;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.platform.web.SortPolicy;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Inviting people by email, and following the emailed link (feature 03). */
@Service
public class InvitationService {

    static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by(Sort.Direction.DESC, "createdAt"))
            .allow("createdAt")
            .allow("expiresAt")
            .allow("email");

    private final InvitationRepository invitations;
    private final MembershipRepository memberships;
    private final OrganizationRepository organizations;
    private final UserAccounts accounts;
    private final Sessions sessions;
    private final TenantTransactions transactions;
    private final RateLimiter rateLimiter;
    private final RateLimits limits;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    InvitationService(
            InvitationRepository invitations,
            MembershipRepository memberships,
            OrganizationRepository organizations,
            UserAccounts accounts,
            Sessions sessions,
            TenantTransactions transactions,
            RateLimiter rateLimiter,
            RateLimits limits,
            ApplicationEventPublisher events,
            Clock clock) {
        this.invitations = invitations;
        this.memberships = memberships;
        this.organizations = organizations;
        this.accounts = accounts;
        this.sessions = sessions;
        this.transactions = transactions;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.events = events;
        this.clock = clock;
    }

    // ---- Administration (ORG_ADMIN, in the organization's scope) -------------------------------------------

    @Transactional(readOnly = true)
    public Page<Invitation> list(InvitationStatus status, Pageable pageable) {
        CurrentMember.requireRole(Role.ORG_ADMIN);
        Pageable sorted = SORT.apply(pageable);
        return status == null ? invitations.findAll(sorted) : invitations.findByStatus(status, sorted);
    }

    @Transactional
    public Invitation invite(String email, Role role) {
        ActiveMember admin = CurrentMember.requireRole(Role.ORG_ADMIN);
        String normalized = email.strip().toLowerCase(Locale.ROOT);
        if (memberships.existsByMemberEmail(normalized)) {
            throw new ConflictException(
                    OrganizationErrorCodes.ALREADY_MEMBER,
                    "This person is already a member",
                    List.of(FieldViolation.of("email", OrganizationErrorCodes.ALREADY_MEMBER, "is already a member")));
        }
        Instant now = clock.instant();
        Optional<Invitation> pending = invitations.findByEmailAndStatus(normalized, InvitationStatus.PENDING);
        if (pending.isPresent()) {
            if (pending.get().effectiveStatus(now) == InvitationStatus.PENDING) {
                throw new ConflictException(
                        OrganizationErrorCodes.ALREADY_PENDING, "This person already has a pending invitation");
            }
            // Expired but not yet swept by the job: record it, so the new invitation can take its place.
            pending.get().expire(now);
            invitations.saveAndFlush(pending.get());
        }
        AccountView inviter = accounts.get(admin.userId());
        Organization organization = organizations
                .findById(admin.organizationId())
                .orElseThrow(() -> NotFoundException.of("Organization", admin.organizationId()));
        String token = OpaqueTokens.generate();
        Invitation invitation = invitations.save(Invitation.create(
                admin.organizationId(),
                normalized,
                role,
                OpaqueTokens.hash(token),
                admin.userId(),
                inviter.fullName(),
                now));
        events.publishEvent(new InvitationCreated(
                normalized, organization.getName(), inviter.fullName(), role, token, inviter.locale()));
        return invitation;
    }

    @Transactional
    public void revoke(UUID invitationId) {
        CurrentMember.requireRole(Role.ORG_ADMIN);
        Invitation invitation =
                invitations.findById(invitationId).orElseThrow(() -> NotFoundException.of("Invitation", invitationId));
        invitation.revoke(clock.instant());
    }

    // ---- The emailed link (public; the organization is only known once the token is found) ----------------

    public InvitationPreview preview(String token, String clientAddress) {
        rateLimiter.acquire(limits.named("invitation-preview-ip", "30/1m"), clientAddress);
        return transactions.readInSystem(() -> {
            Invitation invitation = usableInvitation(token);
            String organizationName = organizations
                    .findById(invitation.getOrganizationId())
                    .map(Organization::getName)
                    .orElseThrow(() -> notFound());
            boolean existingAccount =
                    accounts.findByEmail(invitation.getEmail()).isPresent();
            return new InvitationPreview(
                    organizationName,
                    invitation.getEmail(),
                    invitation.getRole(),
                    invitation.getInvitedByName(),
                    invitation.getExpiresAt(),
                    existingAccount);
        });
    }

    /**
     * New account: {@code fullName} and a new password. Existing account: its current password, which proves the
     * person following the link owns the invited address's account. Either way, sign them in afterwards.
     */
    public IssuedSession accept(String token, String fullName, String password, String clientAddress) {
        rateLimiter.acquire(limits.named("invitation-accept-ip", "10/15m"), clientAddress);
        UUID organizationId =
                transactions.readInSystem(() -> usableInvitation(token).getOrganizationId());
        UUID userId =
                transactions.inOrganization(organizationId, () -> acceptInOrganization(token, fullName, password));
        return sessions.start(userId);
    }

    private UUID acceptInOrganization(String token, String fullName, String password) {
        Instant now = clock.instant();
        Invitation invitation =
                invitations.lockByTokenHash(OpaqueTokens.hash(token)).orElseThrow(InvitationService::notFound);
        invitation.ensureUsable(now);
        Optional<AccountView> existing = accounts.findByEmail(invitation.getEmail());
        UUID userId;
        if (existing.isPresent()) {
            userId = accounts.authenticate(invitation.getEmail(), password);
        } else {
            if (fullName == null || fullName.isBlank()) {
                throw new InvalidInputException(FieldViolation.of(
                        "fullName", PlatformErrorCodes.Field.REQUIRED, "is required for a new account"));
            }
            userId = accounts.createAccount(invitation.getEmail(), fullName, password, UserLocale.EN);
        }
        if (!memberships.existsByUserId(userId)) {
            AccountView account = accounts.get(userId);
            memberships.save(Membership.join(
                    invitation.getOrganizationId(),
                    userId,
                    account.email(),
                    account.fullName(),
                    invitation.getRole(),
                    now));
        }
        invitation.accept(now);
        return userId;
    }

    private Invitation usableInvitation(String token) {
        Invitation invitation =
                invitations.findByTokenHash(OpaqueTokens.hash(token)).orElseThrow(InvitationService::notFound);
        invitation.ensureUsable(clock.instant());
        return invitation;
    }

    private static NotFoundException notFound() {
        return new NotFoundException(OrganizationErrorCodes.INVITATION_NOT_FOUND, "This invitation link is not valid");
    }

    /** What the public invitation page shows before anyone signs in. */
    public record InvitationPreview(
            String organizationName,
            String email,
            Role role,
            String invitedByName,
            Instant expiresAt,
            boolean existingAccount) {}
}
