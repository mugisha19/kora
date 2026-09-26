package com.kora.scope;

/** Error codes the scope module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class ScopeErrorCodes {

    public static final String PARENT_NOT_DELIVERABLE = "wbs.parent_not_deliverable";
    public static final String TOO_DEEP = "wbs.too_deep";
    public static final String CYCLE = "wbs.cycle";
    public static final String HAS_CHILDREN = "wbs.has_children";
    public static final String TYPE_CHANGE_NOT_ALLOWED = "wbs.type_change_not_allowed";

    private ScopeErrorCodes() {}
}
