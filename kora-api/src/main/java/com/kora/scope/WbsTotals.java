package com.kora.scope;

import com.kora.platform.money.Money;
import java.math.BigDecimal;

/** A project's WBS rolled up to one line: what the dashboard and, later, earned value management need. */
public record WbsTotals(
        BigDecimal plannedEffortHours, Money plannedCost, BigDecimal percentComplete, Money earnedValue) {}
