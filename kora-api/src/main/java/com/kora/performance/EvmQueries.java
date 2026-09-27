package com.kora.performance;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Read access for the dashboard read model. No access check: callers work in the tenant scope. */
public interface EvmQueries {

    /** Today's figures; indices are null where they would divide by zero. */
    Figures current(UUID projectId);

    /**
     * Portfolio figures per month from the weekly snapshots, oldest first: each project's last snapshot in or before
     * the month, summed.
     */
    List<Month> monthly(Collection<UUID> projectIds, int months, LocalDate today, String currency);

    record Figures(Money pv, Money ev, Money ac, BigDecimal spi, BigDecimal cpi) {}

    record Month(YearMonth month, Money pv, Money ev, Money ac) {}
}
