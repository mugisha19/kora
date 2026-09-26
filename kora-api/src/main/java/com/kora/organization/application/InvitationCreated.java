package com.kora.organization.application;

import com.kora.identity.UserLocale;
import com.kora.organization.Role;

/**
 * Internal event: an invitation email must be sent. Carries the raw token only in memory, for the link; the database
 * keeps its hash. The email is written in the inviter's language (the invitee's isn't known yet).
 */
record InvitationCreated(
        String email, String organizationName, String inviterName, Role role, String token, UserLocale locale) {

    @Override
    public String toString() {
        return "InvitationCreated[organizationName=" + organizationName + ", role=" + role + "]";
    }
}
