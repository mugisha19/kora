package com.kora.work.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * A sprint's burndown (feature 09): the ideal line falls evenly from the committed points to zero on the last day;
 * the actual line is the remaining points recorded each day. A day without a recording (nothing changed) keeps the
 * previous value; days that haven't happened yet have none.
 */
public record Burndown(int committedPoints, List<Day> days) {

    public record Day(LocalDate date, BigDecimal idealRemaining, Integer actualRemaining) {}

    /**
     * @param committedPoints the frozen commitment, or the sprint's current points before it starts
     * @param today in the organization's time zone
     */
    public static Burndown of(Sprint sprint, int committedPoints, List<SprintDayProgress> recorded, LocalDate today) {
        TreeMap<LocalDate, Integer> byDay = recorded.stream()
                .collect(Collectors.toMap(
                        SprintDayProgress::getDay,
                        SprintDayProgress::getRemainingPoints,
                        (first, second) -> second,
                        TreeMap::new));
        LocalDate start = sprint.getStartDate();
        LocalDate end = sprint.getEndDate();
        int length = (int) (end.toEpochDay() - start.toEpochDay()) + 1;
        BigDecimal committed = BigDecimal.valueOf(committedPoints);
        BigDecimal steps = BigDecimal.valueOf(Math.max(length - 1, 1));
        List<Day> days = new ArrayList<>(length);
        for (int i = 0; i < length; i++) {
            LocalDate date = start.plusDays(i);
            BigDecimal ideal = committed
                    .multiply(BigDecimal.valueOf(Math.max(length - 1 - i, 0)))
                    .divide(steps, 2, RoundingMode.HALF_EVEN);
            days.add(new Day(date, ideal, actual(sprint, byDay, date, today)));
        }
        return new Burndown(committedPoints, days);
    }

    private static Integer actual(Sprint sprint, TreeMap<LocalDate, Integer> byDay, LocalDate date, LocalDate today) {
        if (sprint.getStatus() == SprintStatus.PLANNED || date.isAfter(today)) {
            return null;
        }
        Map.Entry<LocalDate, Integer> latest = byDay.floorEntry(date);
        return latest == null ? null : latest.getValue();
    }
}
