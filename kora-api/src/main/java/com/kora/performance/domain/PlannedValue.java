package com.kora.performance.domain;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Time-phased planned value (feature 17): each work package's planned cost is spread evenly over its planned
 * window, so PV at a date is the budget of the work scheduled up to that date.
 */
public final class PlannedValue {

    private PlannedValue() {}

    /** A work package's budget and the days it is planned to run (inclusive). */
    public record PlannedWork(Money cost, LocalDate start, LocalDate finish) {}

    public static Money asOf(List<PlannedWork> work, LocalDate date, String currency) {
        return work.stream()
                .map(item -> item.cost().times(elapsed(item, date)))
                .reduce(Money.zero(currency), Money::plus);
    }

    /** The share of the window that has passed by the end of {@code date}. */
    static BigDecimal elapsed(PlannedWork work, LocalDate date) {
        if (date.isBefore(work.start())) {
            return BigDecimal.ZERO;
        }
        if (!date.isBefore(work.finish())) {
            return BigDecimal.ONE;
        }
        long days = ChronoUnit.DAYS.between(work.start(), work.finish()) + 1;
        long done = ChronoUnit.DAYS.between(work.start(), date) + 1;
        return BigDecimal.valueOf(done).divide(BigDecimal.valueOf(days), 8, RoundingMode.HALF_EVEN);
    }
}
