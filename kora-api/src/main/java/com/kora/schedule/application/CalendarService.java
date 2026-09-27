package com.kora.schedule.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.platform.error.OptimisticLock;
import com.kora.schedule.domain.PublicHolidays;
import com.kora.schedule.domain.WorkingCalendar;
import com.kora.schedule.domain.WorkingCalendar.Holiday;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The organization's working calendar (feature 10): everyone reads it, administrators change it. */
@Service
public class CalendarService {

    private final WorkingCalendarRepository calendars;

    CalendarService(WorkingCalendarRepository calendars) {
        this.calendars = calendars;
    }

    @Transactional(readOnly = true)
    public WorkingCalendar current() {
        return calendars
                .findFirstBy()
                .orElseGet(() -> WorkingCalendar.standard(CurrentMember.get().organizationId()));
    }

    /**
     * The first change stores the standard calendar (version 0) and then changes it, so the stored calendar starts at
     * version 1 and a client holding the default's version 0 can't overwrite someone else's first change unknowingly.
     */
    @Transactional
    public WorkingCalendar replace(long expectedVersion, Set<DayOfWeek> workingDays, List<Holiday> holidays) {
        ActiveMember member = CurrentMember.requireRole(Role.ORG_ADMIN);
        WorkingCalendar calendar = calendars
                .findFirstBy()
                .orElseGet(() -> calendars.saveAndFlush(WorkingCalendar.standard(member.organizationId())));
        OptimisticLock.check(expectedVersion, calendar.getVersion());
        calendar.replace(workingDays, holidays);
        return calendars.saveAndFlush(calendar);
    }

    /** Adds a country's public holidays for a year; dates already listed keep their name. {@code ORG_ADMIN} only. */
    @Transactional
    public WorkingCalendar addPublicHolidays(long expectedVersion, String country, int year) {
        CurrentMember.requireRole(Role.ORG_ADMIN);
        WorkingCalendar current = current();
        Map<LocalDate, Holiday> merged = new TreeMap<>();
        PublicHolidays.rwanda(year).forEach(holiday -> merged.put(holiday.date(), holiday));
        current.getHolidays().forEach(holiday -> merged.put(holiday.date(), holiday));
        return replace(expectedVersion, EnumSet.copyOf(current.getWorkingDays()), List.copyOf(merged.values()));
    }
}
