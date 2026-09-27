package com.kora.resourcing.domain;

import java.math.BigDecimal;

/** Allocated hours as a share of capacity (feature 16): below 70% under-used, above 100% over-allocated. */
public enum UtilizationBand {
    UNDER,
    HEALTHY,
    OVER;

    private static final BigDecimal HEALTHY_FROM = BigDecimal.valueOf(70);
    private static final BigDecimal FULL = BigDecimal.valueOf(100);

    public static UtilizationBand of(BigDecimal percent) {
        if (percent.compareTo(FULL) > 0) {
            return OVER;
        }
        return percent.compareTo(HEALTHY_FROM) < 0 ? UNDER : HEALTHY;
    }
}
