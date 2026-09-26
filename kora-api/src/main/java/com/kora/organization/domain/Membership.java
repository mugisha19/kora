package com.kora.organization.domain;

import com.kora.organization.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A user's place in one organization, with their role there. Tenant-owned: {@link TenantId} makes Hibernate add
 * the active organization to every query on this entity, and row-level security repeats the check in PostgreSQL.
 *
 * <p>Name and email are a read-only copy of the user's profile (the identity module owns it), refreshed from its
 * {@code UserProfileChanged} event, so members can be searched and sorted without a cross-module join.
 */
@Entity
@Table(name = "memberships")
public class Membership {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "member_email", nullable = false)
    private String memberEmail;

    @Column(name = "member_name", nullable = false)
    private String memberName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    @Version
    private Long version;

    protected Membership() {
        // for JPA
    }

    public static Membership join(
            UUID organizationId, UUID userId, String email, String fullName, Role role, Instant now) {
        Membership membership = new Membership();
        membership.id = UUID.randomUUID();
        membership.organizationId = Objects.requireNonNull(organizationId);
        membership.userId = Objects.requireNonNull(userId);
        membership.memberEmail = Objects.requireNonNull(email);
        membership.memberName = Objects.requireNonNull(fullName);
        membership.role = Objects.requireNonNull(role);
        membership.joinedAt = Objects.requireNonNull(now);
        return membership;
    }

    /**
     * Only the role changes here; whether the organization keeps an administrator is checked by the use case,
     * which alone can see (and lock) all the organization's memberships.
     */
    public void changeRole(Role newRole) {
        this.role = Objects.requireNonNull(newRole);
    }

    public boolean isAdmin() {
        return role == Role.ORG_ADMIN;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getMemberEmail() {
        return memberEmail;
    }

    public String getMemberName() {
        return memberName;
    }

    public Role getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
