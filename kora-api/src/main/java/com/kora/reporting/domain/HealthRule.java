package com.kora.reporting.domain;

import com.kora.portfolio.Health;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;

/**
 * The documented project health (RAG) rule of feature 05, first match wins:
 *
 * <ol>
 *   <li>GREY: not started ({@code PROPOSED}, {@code APPROVED}) or finished ({@code CLOSED}, {@code CANCELLED});
 *   <li>RED: SPI or CPI below 0.80, or a critical risk open past its response date;
 *   <li>AMBER: SPI or CPI below 0.95, the project is past its target end date, or its schedule forecasts a finish
 *       after it;
 *   <li>GREEN otherwise.
 * </ol>
 *
 * SPI and CPI come from earned value (feature 17) and are skipped while they would divide by zero, rather than
 * guessed. The forecast finish is the critical path's (feature 10), for plan-driven projects. A manager's override
 * (with a reason) always wins over the computed value.
 */
public final class HealthRule {

    static final BigDecimal RED_BELOW = new BigDecimal("0.80");
    static final BigDecimal AMBER_BELOW = new BigDecimal("0.95");

    private static final Set<String> NOT_STARTED = Set.of("PROPOSED", "APPROVED");
    private static final Set<String> FINISHED = Set.of("CLOSED", "CANCELLED");

    private HealthRule() {}

    /**
     * @param spi schedule performance index, or null while unknown
     * @param cpi cost performance index, or null while unknown
     */
    public record Inputs(
            String status,
            LocalDate targetEndDate,
            LocalDate today,
            BigDecimal spi,
            BigDecimal cpi,
            boolean criticalRiskOverdue,
            LocalDate forecastFinish) {}

    public record Result(Health health, String reason) {}

    public static Result evaluate(Inputs in) {
        if (NOT_STARTED.contains(in.status())) {
            return new Result(Health.GREY, "Not started");
        }
        if (FINISHED.contains(in.status())) {
            return new Result(Health.GREY, in.status().equals("CLOSED") ? "Closed" : "Cancelled");
        }
        if (below(in.spi(), RED_BELOW)) {
            return new Result(Health.RED, "Schedule performance index " + in.spi() + " is below 0.80");
        }
        if (below(in.cpi(), RED_BELOW)) {
            return new Result(Health.RED, "Cost performance index " + in.cpi() + " is below 0.80");
        }
        if (in.criticalRiskOverdue()) {
            return new Result(Health.RED, "A critical risk is open past its response date");
        }
        if (below(in.spi(), AMBER_BELOW)) {
            return new Result(Health.AMBER, "Schedule performance index " + in.spi() + " is below 0.95");
        }
        if (below(in.cpi(), AMBER_BELOW)) {
            return new Result(Health.AMBER, "Cost performance index " + in.cpi() + " is below 0.95");
        }
        if (isLate(in.status(), in.targetEndDate(), in.today())) {
            return new Result(Health.AMBER, "Past its target end date (" + in.targetEndDate() + ")");
        }
        if (in.forecastFinish() != null && in.forecastFinish().isAfter(in.targetEndDate())) {
            return new Result(
                    Health.AMBER,
                    "Forecast to finish on " + in.forecastFinish() + ", after its target end date ("
                            + in.targetEndDate() + ")");
        }
        return new Result(Health.GREEN, "On track");
    }

    /** In progress, on hold or closing after its target end date. */
    public static boolean isLate(String status, LocalDate targetEndDate, LocalDate today) {
        return !NOT_STARTED.contains(status) && !FINISHED.contains(status) && today.isAfter(targetEndDate);
    }

    /** Sort key for "needs attention first". */
    public static int severity(Health health) {
        return switch (health) {
            case RED -> 0;
            case AMBER -> 1;
            case GREY -> 2;
            case GREEN -> 3;
        };
    }

    private static boolean below(BigDecimal value, BigDecimal threshold) {
        return value != null && value.compareTo(threshold) < 0;
    }
}
