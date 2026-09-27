package com.kora.schedule;

/** Error codes the schedule module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class ScheduleErrorCodes {

    public static final String CYCLE = "schedule.cycle";
    public static final String DEPENDENCY_EXISTS = "schedule.dependency_exists";
    public static final String NOT_PREDICTIVE = "schedule.not_predictive";

    private ScheduleErrorCodes() {}
}
