package com.kora.work.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Completed points of the last closed sprints, oldest first, with their average and range (feature 09). The range is
 * the honest forecast: "the next sprint will likely deliver between low and high", not a single promised number.
 */
public record Velocity(List<Sprint> sprints, BigDecimal average, Integer low, Integer high) {

    public static Velocity of(List<Sprint> closedOldestFirst) {
        List<Integer> completed = closedOldestFirst.stream()
                .map(sprint -> sprint.getCompletedPoints() == null ? 0 : sprint.getCompletedPoints())
                .toList();
        if (completed.isEmpty()) {
            return new Velocity(List.of(), null, null, null);
        }
        int sum = completed.stream().mapToInt(Integer::intValue).sum();
        BigDecimal average =
                BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(completed.size()), 2, RoundingMode.HALF_EVEN);
        return new Velocity(
                List.copyOf(closedOldestFirst),
                average,
                completed.stream().mapToInt(Integer::intValue).min().orElseThrow(),
                completed.stream().mapToInt(Integer::intValue).max().orElseThrow());
    }
}
