package com.kora.platform.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    void scalesToTheCurrencysMinorUnits() {
        assertThat(Money.of("12500", "RWF").amountText()).isEqualTo("12500");
        assertThat(Money.of("99.9", "USD").amountText()).isEqualTo("99.90");
        assertThat(Money.of("12500.00", "RWF").amountText()).isEqualTo("12500");
    }

    @Test
    void refusesMoreDecimalsThanTheCurrencyHas() {
        assertThatThrownBy(() -> Money.of("12500.5", "RWF")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.of("1.005", "USD")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void addsExactlyWhereDoublesWouldDrift() {
        Money total = Money.zero("USD");
        for (int i = 0; i < 10; i++) {
            total = total.plus(Money.of("0.10", "USD"));
        }

        assertThat(total).isEqualTo(Money.of("1.00", "USD"));
    }

    @Test
    void roundsHalfEvenWhenMultiplying() {
        assertThat(Money.of("0.25", "USD").times(new BigDecimal("0.5")).amountText())
                .isEqualTo("0.12");
        assertThat(Money.of("0.35", "USD").times(new BigDecimal("0.5")).amountText())
                .isEqualTo("0.18");
        assertThat(Money.of("333", "RWF").times(new BigDecimal("0.5")).amountText())
                .isEqualTo("166");
    }

    @Test
    void neverMixesCurrencies() {
        assertThatThrownBy(() -> Money.of("1", "USD").plus(Money.of("1", "EUR")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void neverPrintsScientificNotation() {
        assertThat(Money.of("1E+7", "RWF").amountText()).isEqualTo("10000000");
    }
}
