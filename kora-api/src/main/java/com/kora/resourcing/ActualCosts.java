package com.kora.resourcing;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.UUID;

/**
 * The actual cost of a project for earned value (feature 17): approved hours × the cost rate valid on the day worked.
 * No access check: callers work in the tenant scope.
 */
public interface ActualCosts {

    Ledger ledger(UUID projectId, String currency);

    /**
     * @param costByDay cost of the approved hours of each day
     * @param unratedHours approved hours of people without a rate for that day; they cost nothing
     */
    record Ledger(NavigableMap<LocalDate, Money> costByDay, BigDecimal unratedHours, String currency) {

        public Ledger {
            costByDay = new TreeMap<>(costByDay);
        }

        public Money upTo(LocalDate day) {
            return costByDay.headMap(day, true).values().stream().reduce(Money.zero(currency), Money::plus);
        }

        public static Ledger of(Map<LocalDate, Money> costByDay, BigDecimal unratedHours, String currency) {
            return new Ledger(new TreeMap<>(costByDay), unratedHours, currency);
        }
    }
}
