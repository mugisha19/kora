package com.kora.work.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * How far a work package is, measured from its tasks (feature 08): a finished task counts 100%; an unfinished one
 * counts the share of its estimate already burnt ({@code (estimate − remaining) / estimate}), or 0% without an
 * estimate. Tasks are weighted by their estimate, with at least one hour, so a small unestimated task still counts.
 */
public final class TaskProgressRule {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private TaskProgressRule() {}

    public static BigDecimal percentComplete(List<Task> tasks) {
        if (tasks.isEmpty()) {
            return BigDecimal.ZERO.setScale(2);
        }
        BigDecimal weighted = BigDecimal.ZERO;
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (Task task : tasks) {
            BigDecimal weight = weight(task);
            weighted = weighted.add(percent(task).multiply(weight));
            totalWeight = totalWeight.add(weight);
        }
        return weighted.divide(totalWeight, 2, RoundingMode.HALF_EVEN);
    }

    static BigDecimal percent(Task task) {
        if (task.isDone()) {
            return HUNDRED;
        }
        BigDecimal estimate = task.getEstimateHours();
        BigDecimal remaining = task.getRemainingHours();
        if (estimate == null || estimate.signum() == 0 || remaining == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal burnt = estimate.subtract(remaining).max(BigDecimal.ZERO);
        return burnt.multiply(HUNDRED)
                .divide(estimate, 4, RoundingMode.HALF_EVEN)
                .min(HUNDRED);
    }

    private static BigDecimal weight(Task task) {
        BigDecimal estimate = task.getEstimateHours();
        return estimate == null ? BigDecimal.ONE : estimate.max(BigDecimal.ONE);
    }
}
