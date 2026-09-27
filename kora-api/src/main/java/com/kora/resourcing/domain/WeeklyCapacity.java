package com.kora.resourcing.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Hours someone can work in a given week (feature 16): their weekly hours, less the share of the week's working
 * days lost to public holidays and their leave. Four working days out of five leave 80% of a 40-hour week: 32 hours.
 */
public final class WeeklyCapacity {

    private WeeklyCapacity() {}

    /**
     * @param periods the person's capacity history, any order; none means the standard 40-hour week
     */
    public static BigDecimal of(
            IsoWeek week,
            Collection<CapacityPeriod> periods,
            Set<DayOfWeek> workingDays,
            Set<LocalDate> holidays,
            List<Leave> leave) {
        if (workingDays.isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal hoursPerWeek = hoursPerWeekOn(week.monday(), periods);
        int available = 0;
        for (int i = 0; i < 7; i++) {
            LocalDate day = week.monday().plusDays(i);
            boolean working = workingDays.contains(day.getDayOfWeek()) && !holidays.contains(day);
            if (working && leave.stream().noneMatch(away -> away.covers(day))) {
                available++;
            }
        }
        return hoursPerWeek
                .multiply(BigDecimal.valueOf(available))
                .divide(BigDecimal.valueOf(workingDays.size()), 2, RoundingMode.HALF_EVEN);
    }

    /** The hours of the latest period starting on or before the day. */
    public static BigDecimal hoursPerWeekOn(LocalDate day, Collection<CapacityPeriod> periods) {
        return periods.stream()
                .filter(period -> !period.getValidFrom().isAfter(day))
                .max(Comparator.comparing(CapacityPeriod::getValidFrom))
                .map(CapacityPeriod::getHoursPerWeek)
                .orElse(CapacityPeriod.STANDARD_WEEK);
    }
}
