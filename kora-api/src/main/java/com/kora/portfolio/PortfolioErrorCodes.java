package com.kora.portfolio;

/** Error codes the portfolio module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class PortfolioErrorCodes {

    public static final String PORTFOLIO_ARCHIVED = "portfolios.archived";
    public static final String PORTFOLIO_NOT_EMPTY = "portfolios.not_empty";
    public static final String PROJECT_CODE_TAKEN = "projects.code_taken";
    public static final String INVALID_TRANSITION = "projects.invalid_transition";
    public static final String CHARTER_APPROVAL_REQUIRED = "projects.charter_approval_required";
    public static final String METHODOLOGY_LOCKED = "projects.methodology_locked";
    public static final String MEMBER_IS_MANAGER = "project_members.is_manager";
    public static final String CHARTER_NOT_DRAFT = "charters.not_draft";
    public static final String CHARTER_NOT_SUBMITTED = "charters.not_submitted";
    public static final String CHARTER_INCOMPLETE = "charters.incomplete";

    private PortfolioErrorCodes() {}
}
