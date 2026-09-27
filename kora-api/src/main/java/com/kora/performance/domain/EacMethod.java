package com.kora.performance.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;

/**
 * Strategy pattern (feature 17): how to forecast the cost at completion. Each is exact arithmetic on the amounts
 * (not on rounded indices), so the textbook results come out to the unit.
 */
public enum EacMethod {
    /** BAC ÷ CPI = BAC × AC ÷ EV: today's cost efficiency continues. */
    TYPICAL {
        @Override
        Optional<BigDecimal> eac(BigDecimal bac, BigDecimal pv, BigDecimal ev, BigDecimal ac) {
            if (ev.signum() == 0) {
                return Optional.empty();
            }
            return Optional.of(bac.multiply(ac).divide(ev, SCALE, RoundingMode.HALF_EVEN));
        }
    },
    /** AC + (BAC − EV): the variance so far was a one-off; the rest goes to plan. */
    ATYPICAL {
        @Override
        Optional<BigDecimal> eac(BigDecimal bac, BigDecimal pv, BigDecimal ev, BigDecimal ac) {
            return Optional.of(ac.add(bac.subtract(ev)));
        }
    },
    /** AC + (BAC − EV) ÷ (CPI × SPI) = AC + (BAC − EV) × AC × PV ÷ EV²: cost and schedule pressure both continue. */
    COMPOSITE {
        @Override
        Optional<BigDecimal> eac(BigDecimal bac, BigDecimal pv, BigDecimal ev, BigDecimal ac) {
            if (ev.signum() == 0 || ac.signum() == 0 || pv.signum() == 0) {
                return Optional.empty();
            }
            BigDecimal remaining =
                    bac.subtract(ev).multiply(ac).multiply(pv).divide(ev.multiply(ev), SCALE, RoundingMode.HALF_EVEN);
            return Optional.of(ac.add(remaining));
        }
    };

    private static final int SCALE = 8;

    /** Empty when the formula would divide by zero. */
    abstract Optional<BigDecimal> eac(BigDecimal bac, BigDecimal pv, BigDecimal ev, BigDecimal ac);
}
