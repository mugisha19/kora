package com.kora.organization;

import java.time.ZoneId;

/**
 * The active organization's time zone. Anything that depends on "today" (a project becoming late, a deadline, a
 * timesheet week) uses it: in Kigali a new day starts two hours before it does in UTC.
 */
public interface OrganizationTimeZone {

    ZoneId zone();
}
