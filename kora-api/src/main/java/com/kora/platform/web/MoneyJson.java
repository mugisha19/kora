package com.kora.platform.web;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Contract schema {@code Money}: the amount travels as a decimal string so no client or proxy ever turns it into a
 * binary float.
 */
public record MoneyJson(
        @NotNull @Pattern(regexp = "-?[0-9]{1,15}(\\.[0-9]{1,4})?")
        String amount,

        @NotNull @Pattern(regexp = "[A-Z]{3}") String currency) {

    public static MoneyJson from(Money money) {
        return money == null ? null : new MoneyJson(money.amountText(), money.currency());
    }

    /**
     * @param field where to report problems, e.g. {@code budget}
     * @param expectedCurrency every amount in an organization is in its currency
     */
    public Money toMoney(String field, String expectedCurrency) {
        if (!currency.equals(expectedCurrency)) {
            throw new InvalidInputException(FieldViolation.of(
                    field + ".currency",
                    PlatformErrorCodes.Field.INVALID,
                    "must be the organization's currency, " + expectedCurrency));
        }
        return parse(field + ".amount", amount, currency);
    }

    /** Parses a bare amount (e.g. a WBS planned cost) in the given currency. */
    public static Money parse(String field, String amount, String currency) {
        try {
            return Money.of(amount, currency);
        } catch (IllegalArgumentException e) {
            throw new InvalidInputException(FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, e.getMessage()));
        }
    }
}
