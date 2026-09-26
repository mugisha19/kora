package com.kora.organization.application;

import com.kora.identity.UserProfileChanged;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationErrorCodes;
import com.kora.organization.Role;
import com.kora.organization.domain.Membership;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.web.SortPolicy;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Members of the active organization and their roles (feature 03). */
@Service
public class MemberService {

    /** Contract sort fields for {@code GET /members}, mapped to entity properties. */
    static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by("memberName"))
            .allow("fullName", "memberName")
            .allow("email", "memberEmail")
            .allow("role")
            .allow("joinedAt");

    private final MembershipRepository memberships;
    private final OrganizationRepository organizations;

    MemberService(MembershipRepository memberships, OrganizationRepository organizations) {
        this.memberships = memberships;
        this.organizations = organizations;
    }

    /** Any member may see who else is in the organization (people pickers need it). */
    @Transactional(readOnly = true)
    public Page<Membership> search(MemberSearch search, Pageable pageable) {
        CurrentMember.get();
        return memberships.search(search, SORT.apply(pageable));
    }

    /** {@code ORG_ADMIN} only. The organization always keeps at least one {@code ORG_ADMIN}. */
    @Transactional
    public Membership changeRole(UUID membershipId, long expectedVersion, Role newRole) {
        ActiveMember admin = CurrentMember.requireRole(Role.ORG_ADMIN);
        // Lock first: concurrent role changes in this organization now run one after the other, so the admin count
        // below can't be stale.
        organizations.lockById(admin.organizationId());
        Membership membership = find(membershipId);
        OptimisticLock.check(expectedVersion, membership.getVersion());
        if (membership.isAdmin() && newRole != Role.ORG_ADMIN && memberships.countByRole(Role.ORG_ADMIN) <= 1) {
            throw new ConflictException(
                    OrganizationErrorCodes.LAST_ADMIN, "The organization must keep at least one administrator");
        }
        membership.changeRole(newRole);
        return memberships.saveAndFlush(membership);
    }

    /** {@code ORG_ADMIN} only, and not yourself (which also means the last admin can never be removed). */
    @Transactional
    public void remove(UUID membershipId) {
        ActiveMember admin = CurrentMember.requireRole(Role.ORG_ADMIN);
        Membership membership = find(membershipId);
        if (membership.getUserId().equals(admin.userId())) {
            throw new ConflictException(
                    OrganizationErrorCodes.SELF_REMOVAL, "You can't remove yourself from the organization");
        }
        memberships.delete(membership);
    }

    /** Refreshes the profile copy on every membership of the user. Runs in the system scope (see listener). */
    @Transactional
    public void syncProfile(UserProfileChanged change) {
        memberships.updateProfile(change.userId(), change.email(), change.fullName());
    }

    private Membership find(UUID membershipId) {
        return memberships.findById(membershipId).orElseThrow(() -> NotFoundException.of("Member", membershipId));
    }
}
