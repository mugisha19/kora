package com.kora.resourcing.domain;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Costs approved hours (feature 15): hours × the rate valid on the day worked. Hours of someone without a rate that
 * day cost nothing but are counted, so earned value can say its actual cost is incomplete.
 */
public final class CostLedger {

    private CostLedger() {}

    public record Costing(Map<LocalDate, Money> costByDay, BigDecimal unratedHours) {}

    public static Costing cost(Collection<TimeEntry> approved, Collection<CostRate> rates, String currency) {
        Map<UUID, List<CostRate>> ratesByPerson = rates.stream().collect(Collectors.groupingBy(CostRate::getUserId));
        Map<LocalDate, Money> byDay = new TreeMap<>();
        BigDecimal unrated = BigDecimal.ZERO;
        for (TimeEntry entry : approved) {
            Optional<CostRate> rate = ratesByPerson.getOrDefault(entry.getUserId(), List.of()).stream()
                    .filter(candidate -> !candidate.getValidFrom().isAfter(entry.getDate()))
                    .max(Comparator.comparing(CostRate::getValidFrom));
            if (rate.isEmpty()) {
                unrated = unrated.add(entry.getHours());
                continue;
            }
            Money cost = rate.get().getHourlyRate().times(entry.getHours());
            byDay.merge(entry.getDate(), cost, Money::plus);
        }
        return new Costing(byDay, unrated);
    }
}
