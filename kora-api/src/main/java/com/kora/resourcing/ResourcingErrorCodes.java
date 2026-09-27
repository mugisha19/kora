package com.kora.resourcing;

/** Error codes the resourcing module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class ResourcingErrorCodes {

    public static final String LOCKED = "timesheets.locked";
    public static final String EMPTY = "timesheets.empty";
    public static final String NOT_SUBMITTED = "timesheets.not_submitted";
    public static final String SELF_APPROVAL = "timesheets.self_approval";

    private ResourcingErrorCodes() {}
}
