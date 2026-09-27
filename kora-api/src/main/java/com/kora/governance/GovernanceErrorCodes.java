package com.kora.governance;

/** Error codes the governance module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class GovernanceErrorCodes {

    public static final String RISK_CLOSED = "risks.closed";
    public static final String ISSUE_INVALID_TRANSITION = "issues.invalid_transition";
    public static final String CR_NOT_DRAFT = "change_requests.not_draft";
    public static final String CR_NOT_IN_REVIEW = "change_requests.not_in_review";
    public static final String CR_SELF_APPROVAL = "change_requests.self_approval";
    public static final String CR_INVALID_TRANSITION = "change_requests.invalid_transition";

    private GovernanceErrorCodes() {}
}
