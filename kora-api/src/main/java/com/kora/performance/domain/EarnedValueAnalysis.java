package com.kora.performance.domain;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Optional;

/**
 * The EVM metrics (feature 17) from BAC, PV, EV and AC. Money stays {@link BigDecimal} and is rounded half-even to the
 * currency's minor units only at the end; indices are rounded to two decimals for display but never fed back into
 * money figures. Anything that would divide by zero is left out and listed with the reason.
 */
public record EarnedValueAnalysis(
        Money bac,
        Money pv,
        Money ev,
        Money ac,
        Money sv,
        Money cv,
        BigDecimal spi,
        BigDecimal cpi,
        Money eac,
        Money etc,
        Money vac,
        BigDecimal tcpi,
        List<Unavailable> unavailable) {

    public record Unavailable(String metric, String reason) {}

    /**
     * @param ev null when the percent-complete method has nothing to measure with
     * @param evMissingReason why, when {@code ev} is null
     */
    public static EarnedValueAnalysis of(
            Money bac, Money pv, Money ev, String evMissingReason, Money ac, EacMethod method) {
        List<Unavailable> missing = new ArrayList<>();
        String currency = bac.currency();
        if (bac.isZero()) {
            missing.add(new Unavailable("bac", "The WBS has no planned cost"));
        }
        if (ev == null) {
            for (String metric : List.of("ev", "sv", "cv", "spi", "cpi", "eac", "etc", "vac", "tcpi")) {
                missing.add(new Unavailable(metric, evMissingReason));
            }
            return new EarnedValueAnalysis(bac, pv, null, ac, null, null, null, null, null, null, null, null, missing);
        }
        BigDecimal spi = ratio(ev, pv).orElse(null);
        if (spi == null) {
            missing.add(new Unavailable("spi", "No work was planned to be done by now"));
        }
        BigDecimal cpi = ratio(ev, ac).orElse(null);
        if (cpi == null) {
            missing.add(new Unavailable("cpi", "No actual cost yet"));
        }
        Money eac = method.eac(bac.amount(), pv.amount(), ev.amount(), ac.amount())
                .map(value -> money(value, currency))
                .orElse(null);
        if (eac == null) {
            String reason = ev.isZero() ? "Nothing has been earned yet" : "No actual cost or planned value yet";
            for (String metric : List.of("eac", "etc", "vac")) {
                missing.add(new Unavailable(metric, reason));
            }
        }
        BigDecimal remainingBudget = bac.amount().subtract(ac.amount());
        BigDecimal tcpi = null;
        if (remainingBudget.signum() == 0) {
            missing.add(new Unavailable("tcpi", "The whole budget is spent"));
        } else {
            tcpi = bac.amount().subtract(ev.amount()).divide(remainingBudget, 2, RoundingMode.HALF_EVEN);
        }
        return new EarnedValueAnalysis(
                bac,
                pv,
                ev,
                ac,
                ev.minus(pv),
                ev.minus(ac),
                spi,
                cpi,
                eac,
                eac == null ? null : eac.minus(ac),
                eac == null ? null : bac.minus(eac),
                tcpi,
                missing);
    }

    private static Optional<BigDecimal> ratio(Money numerator, Money denominator) {
        if (denominator.isZero()) {
            return Optional.empty();
        }
        return Optional.of(numerator.amount().divide(denominator.amount(), 2, RoundingMode.HALF_EVEN));
    }

    private static Money money(BigDecimal value, String currency) {
        int digits = Math.max(0, Currency.getInstance(currency).getDefaultFractionDigits());
        return new Money(value.setScale(digits, RoundingMode.HALF_EVEN), currency);
    }
}
