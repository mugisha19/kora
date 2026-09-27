package com.kora.work;

/** Error codes the work module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class WorkErrorCodes {

    public static final String INVALID_TRANSITION = "tasks.invalid_transition";
    public static final String WIP_LIMIT_REACHED = "tasks.wip_limit_reached";
    public static final String REMAINING_WORK = "tasks.remaining_work";
    public static final String NOT_AGILE = "sprints.not_agile";
    public static final String ALREADY_ACTIVE = "sprints.already_active";
    public static final String NOT_PLANNED = "sprints.not_planned";
    public static final String NOT_ACTIVE = "sprints.not_active";
    public static final String CLOSED = "sprints.closed";

    private WorkErrorCodes() {}
}
