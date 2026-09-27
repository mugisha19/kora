package com.kora.resourcing.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** An ISO-8601 week, Monday to Sunday, written {@code 2026-W40}: the unit of a timesheet. */
public record IsoWeek(LocalDate monday) {

    private static final Pattern TEXT = Pattern.compile("(\\d{4})-W(\\d{2})");

    public IsoWeek {
        if (monday.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new IllegalArgumentException("A week starts on a Monday: " + monday);
        }
    }

    public static IsoWeek containing(LocalDate day) {
        return new IsoWeek(day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
    }

    /** @throws InvalidInputException on {@code field} for text that isn't an existing ISO week */
    public static IsoWeek parse(String text, String field) {
        Matcher matcher = TEXT.matcher(text == null ? "" : text);
        if (matcher.matches()) {
            int year = Integer.parseInt(matcher.group(1));
            int week = Integer.parseInt(matcher.group(2));
            LocalDate fourthOfJanuary = LocalDate.of(year, 1, 4);
            long weeks = IsoFields.WEEK_OF_WEEK_BASED_YEAR
                    .rangeRefinedBy(fourthOfJanuary)
                    .getMaximum();
            if (week >= 1 && week <= weeks) {
                return new IsoWeek(fourthOfJanuary
                        .with(IsoFields.WEEK_OF_WEEK_BASED_YEAR, week)
                        .with(DayOfWeek.MONDAY));
            }
        }
        throw new InvalidInputException(
                FieldViolation.of(field, PlatformErrorCodes.Field.FORMAT, "must be an ISO week such as 2026-W40"));
    }

    public LocalDate sunday() {
        return monday.plusDays(6);
    }

    public boolean contains(LocalDate day) {
        return !day.isBefore(monday) && !day.isAfter(sunday());
    }

    @Override
    public String toString() {
        return "%d-W%02d"
                .formatted(monday.get(IsoFields.WEEK_BASED_YEAR), monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
    }
}
