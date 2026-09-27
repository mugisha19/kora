package com.kora.organization;

import java.util.UUID;

/**
 * Adds an existing account to an organization without an invitation. Only the demo data seeder uses it (feature 22):
 * real people join through invitations, which prove they own their email address. Implemented in the {@code demo}
 * profile only, so production has no such bean.
 */
public interface MemberProvisioning {

    /** Does nothing when the account is already a member. */
    void addMember(UUID organizationId, UUID userId, Role role);
}
