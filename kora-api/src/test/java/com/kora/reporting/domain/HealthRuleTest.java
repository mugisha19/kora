package com.kora.reporting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.portfolio.Health;
import com.kora.reporting.domain.HealthRule.Inputs;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Feature 05: the documented RAG rule, first match wins. */
class HealthRuleTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 27);

    @ParameterizedTest(name = "{0}, end {1}, SPI {2}, CPI {3}, critical risk {4} -> {5}")
    @CsvSource(
            nullValues = "-",
            value = {
                "PROPOSED,    2026-12-31, -,    -,    false, GREY",
                "APPROVED,    2026-01-01, 0.5,  -,    true,  GREY",
                "CLOSED,      2026-01-01, -,    -,    false, GREY",
                "IN_PROGRESS, 2026-12-31, -,    -,    false, GREEN",
                "IN_PROGRESS, 2026-09-26, -,    -,    false, AMBER",
                "IN_PROGRESS, 2026-09-27, -,    -,    false, GREEN",
                "ON_HOLD,     2026-01-01, -,    -,    false, AMBER",
                "IN_PROGRESS, 2026-12-31, 0.79, -,    false, RED",
                "IN_PROGRESS, 2026-12-31, 0.80, -,    false, AMBER",
                "IN_PROGRESS, 2026-12-31, 0.95, 0.95, false, GREEN",
                "IN_PROGRESS, 2026-12-31, 1.10, 0.90, false, AMBER",
                "IN_PROGRESS, 2026-12-31, 1.10, 1.10, true,  RED"
            })
    void appliesTheRule(
            String status, LocalDate end, BigDecimal spi, BigDecimal cpi, boolean criticalRisk, Health expected) {
        HealthRule.Result result = HealthRule.evaluate(new Inputs(status, end, TODAY, spi, cpi, criticalRisk, null));

        assertThat(result.health()).isEqualTo(expected);
        assertThat(result.reason()).isNotBlank();
    }

    @Test
    void aForecastFinishAfterTheTargetEndDateIsAmber() {
        LocalDate end = LocalDate.of(2026, 12, 31);

        HealthRule.Result late = HealthRule.evaluate(
                new Inputs("IN_PROGRESS", end, TODAY, null, null, false, LocalDate.of(2027, 1, 15)));
        HealthRule.Result onTime = HealthRule.evaluate(new Inputs("IN_PROGRESS", end, TODAY, null, null, false, end));

        assertThat(late.health()).isEqualTo(Health.AMBER);
        assertThat(late.reason()).isEqualTo("Forecast to finish on 2027-01-15, after its target end date (2026-12-31)");
        assertThat(onTime.health()).isEqualTo(Health.GREEN);
    }
}
