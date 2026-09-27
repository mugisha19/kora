package com.kora.schedule.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * Numbers the working days from a project's start: day 0 is the first working day on or after it, day 1 the next
 * working day, and so on, skipping non-working weekdays and holidays. The schedule calculates in these numbers and
 * turns them into dates here.
 */
public final class WorkingDays {

    /** Far enough for any project, near enough to stop a calendar mistake from looping for ever. */
    private static final int MAX_DAYS = 366 * 50;

    private final Set<DayOfWeek> workingDays;
    private final Set<LocalDate> holidays;
    private final List<LocalDate> dates = new ArrayList<>();

    public WorkingDays(Set<DayOfWeek> workingDays, Set<LocalDate> holidays, LocalDate origin) {
        if (workingDays.isEmpty()) {
            throw new IllegalArgumentException("A calendar needs at least one working day");
        }
        this.workingDays = Set.copyOf(workingDays);
        this.holidays = Set.copyOf(holidays);
        dates.add(onOrAfter(origin));
    }

    public boolean isWorkingDay(LocalDate date) {
        return workingDays.contains(date.getDayOfWeek()) && !holidays.contains(date);
    }

    /** The date of working day {@code index} (0 = the project's first working day). */
    public LocalDate date(int index) {
        if (index < 0) {
            throw new IllegalArgumentException("Working day numbers start at 0: " + index);
        }
        while (dates.size() <= index) {
            dates.add(onOrAfter(dates.getLast().plusDays(1)));
        }
        return dates.get(index);
    }

    /**
     * The number of the first working day on or after {@code date}; negative for a date before the first working
     * day ({@code -n} when n working days lie in between).
     */
    public int index(LocalDate date) {
        LocalDate first = dates.getFirst();
        if (date.isBefore(first)) {
            int count = 0;
            for (LocalDate day = date; day.isBefore(first); day = day.plusDays(1)) {
                if (isWorkingDay(day)) {
                    count++;
                }
            }
            return -count;
        }
        while (dates.getLast().isBefore(date)) {
            date(dates.size());
        }
        int found = Collections.binarySearch(dates, date);
        return found >= 0 ? found : -found - 1;
    }

    private LocalDate onOrAfter(LocalDate date) {
        LocalDate day = date;
        for (int i = 0; !isWorkingDay(day); i++) {
            if (i > MAX_DAYS) {
                throw new IllegalStateException("No working day within 50 years of " + date);
            }
            day = day.plusDays(1);
        }
        return day;
    }
}
