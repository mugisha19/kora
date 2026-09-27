package com.kora.platform.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Objects;

/**
 * An amount of money in one currency. {@link BigDecimal} only (a {@code double} can't represent 0.1), always scaled to
 * the currency's minor units: RWF has none, so {@code 12500.50 RWF} is rejected rather than silently rounded.
 * Arithmetic that can produce fractions (percentages, ratios) rounds half-even, the usual choice for money because
 * it doesn't bias totals upwards.
 */
public record Money(BigDecimal amount, String currency) {

    public Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        int digits = fractionDigits(currency);
        if (amount.stripTrailingZeros().scale() > digits) {
            throw new IllegalArgumentException(currency + " amounts have at most " + digits + " decimal places");
        }
        amount = amount.setScale(digits, RoundingMode.UNNECESSARY);
    }

    public static Money of(String amount, String currency) {
        return new Money(new BigDecimal(amount), currency);
    }

    public static Money zero(String currency) {
        return new Money(BigDecimal.ZERO, currency);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.subtract(other.amount), currency);
    }

    public boolean isZero() {
        return amount.signum() == 0;
    }

    /** Multiplies by a factor (e.g. a percentage as a fraction), rounding half-even to minor units. */
    public Money times(BigDecimal factor) {
        return new Money(amount.multiply(factor).setScale(fractionDigits(currency), RoundingMode.HALF_EVEN), currency);
    }

    public boolean isNegative() {
        return amount.signum() < 0;
    }

    /** Plain decimal text for JSON ({@code "12500000"}, {@code "99.95"}); never scientific notation. */
    public String amountText() {
        return amount.toPlainString();
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("Cannot combine " + currency + " and " + other.currency);
        }
    }

    private static int fractionDigits(String currency) {
        return Math.max(0, Currency.getInstance(currency).getDefaultFractionDigits());
    }
}
