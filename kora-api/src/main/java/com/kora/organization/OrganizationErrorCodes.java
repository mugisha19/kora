package com.kora.organization;

/** Error codes the organization module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class OrganizationErrorCodes {

    public static final String CURRENCY_LOCKED = "organization.currency_locked";
    public static final String LAST_ADMIN = "members.last_admin";
    public static final String SELF_REMOVAL = "members.self_removal";
    public static final String ALREADY_MEMBER = "invitations.already_member";
    public static final String ALREADY_PENDING = "invitations.already_pending";
    public static final String NOT_PENDING = "invitations.not_pending";
    public static final String INVITATION_NOT_FOUND = "invitations.not_found";
    public static final String INVITATION_EXPIRED = "invitations.expired";
    public static final String INVITATION_REVOKED = "invitations.revoked";
    public static final String INVITATION_ALREADY_ACCEPTED = "invitations.already_accepted";

    private OrganizationErrorCodes() {}
}
