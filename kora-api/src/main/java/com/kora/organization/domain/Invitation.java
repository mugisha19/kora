package com.kora.organization.domain;

import com.kora.organization.OrganizationErrorCodes;
import com.kora.organization.Role;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.GoneException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * An emailed, single-use, expiring invitation to join an organization with a given role. The link carries a random
 * token; only its SHA-256 is stored. Following the link never signs anyone in by itself: accepting needs a new
 * password (new account) or the account's current password.
 */
@Entity
@Table(name = "invitations")
public class Invitation {

    public static final Duration LIFETIME = Duration.ofDays(14);

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(nullable = false, updatable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Role role;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InvitationStatus status;

    @Column(name = "invited_by", nullable = false, updatable = false)
    private UUID invitedBy;

    @Column(name = "invited_by_name", nullable = false, updatable = false)
    private String invitedByName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Version
    private Long version;

    protected Invitation() {
        // for JPA
    }

    /** @param email already normalized */
    public static Invitation create(
            UUID organizationId,
            String email,
            Role role,
            String tokenHash,
            UUID invitedBy,
            String invitedByName,
            Instant now) {
        Invitation invitation = new Invitation();
        invitation.id = UUID.randomUUID();
        invitation.organizationId = Objects.requireNonNull(organizationId);
        invitation.email = Objects.requireNonNull(email);
        invitation.role = Objects.requireNonNull(role);
        invitation.tokenHash = Objects.requireNonNull(tokenHash);
        invitation.status = InvitationStatus.PENDING;
        invitation.invitedBy = Objects.requireNonNull(invitedBy);
        invitation.invitedByName = Objects.requireNonNull(invitedByName);
        invitation.createdAt = Objects.requireNonNull(now);
        invitation.expiresAt = now.plus(LIFETIME);
        return invitation;
    }

    /**
     * The status as the user experiences it: a pending invitation past its expiry is expired even before the
     * scheduled job has written that down.
     */
    public InvitationStatus effectiveStatus(Instant now) {
        return status == InvitationStatus.PENDING && !now.isBefore(expiresAt) ? InvitationStatus.EXPIRED : status;
    }

    /** @throws GoneException with the reason ({@code 410}) when the link can no longer be used */
    public void ensureUsable(Instant now) {
        String unusable = effectiveStatus(now).unusableCode();
        if (unusable != null) {
            throw new GoneException(unusable, "This invitation can no longer be used");
        }
    }

    public void accept(Instant now) {
        ensureUsable(now);
        this.status = status.accept();
        this.decidedAt = now;
    }

    public void revoke(Instant now) {
        if (effectiveStatus(now) != InvitationStatus.PENDING) {
            throw new ConflictException(OrganizationErrorCodes.NOT_PENDING, "Only pending invitations can be revoked");
        }
        this.status = status.revoke();
        this.decidedAt = now;
    }

    /** Records an expiry that has already happened (see {@link #effectiveStatus}). */
    public void expire(Instant now) {
        if (effectiveStatus(now) == InvitationStatus.EXPIRED && status == InvitationStatus.PENDING) {
            this.status = status.expire();
            this.decidedAt = now;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public String getEmail() {
        return email;
    }

    public Role getRole() {
        return role;
    }

    public UUID getInvitedBy() {
        return invitedBy;
    }

    public String getInvitedByName() {
        return invitedByName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
