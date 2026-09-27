package com.kora.performance.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.performance.domain.EarnedValueAnalysis.Unavailable;
import com.kora.performance.domain.PercentCompleteMethod.WorkPackage;
import com.kora.performance.domain.PlannedValue.PlannedWork;
import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Feature 17: the EVM formulas against a textbook example, the methods and the time-phased PV. */
class EarnedValueTest {

    private static Money rwf(String amount) {
        return Money.of(amount, "RWF");
    }

    /** BAC 100,000; at the status date PV 50,000, EV 40,000, AC 45,000: behind schedule and over budget. */
    @Test
    void reproducesTheTextbookExampleExactly() {
        EarnedValueAnalysis evm = EarnedValueAnalysis.of(
                rwf("100000"), rwf("50000"), rwf("40000"), null, rwf("45000"), EacMethod.TYPICAL);

        assertThat(evm.sv()).isEqualTo(rwf("-10000"));
        assertThat(evm.cv()).isEqualTo(rwf("-5000"));
        assertThat(evm.spi()).isEqualByComparingTo("0.80");
        assertThat(evm.cpi()).isEqualByComparingTo("0.89");
        assertThat(evm.eac()).isEqualTo(rwf("112500"));
        assertThat(evm.etc()).isEqualTo(rwf("67500"));
        assertThat(evm.vac()).isEqualTo(rwf("-12500"));
        assertThat(evm.tcpi()).isEqualByComparingTo("1.09");
        assertThat(evm.unavailable()).isEmpty();
    }

    @Test
    void eachEacMethodForecastsDifferently() {
        assertThat(eac(EacMethod.TYPICAL)).isEqualTo(rwf("112500"));
        assertThat(eac(EacMethod.ATYPICAL)).isEqualTo(rwf("105000"));
        // 45,000 + 60,000 ÷ (0.888… × 0.8) = 45,000 + 84,375
        assertThat(eac(EacMethod.COMPOSITE)).isEqualTo(rwf("129375"));
    }

    @Test
    void moneyIsRoundedOnlyAtTheEndToTheCurrencysMinorUnits() {
        EarnedValueAnalysis evm = EarnedValueAnalysis.of(
                Money.of("1000.00", "USD"),
                Money.of("500.00", "USD"),
                Money.of("333.33", "USD"),
                null,
                Money.of("400.00", "USD"),
                EacMethod.TYPICAL);

        // 1000 × 400 ÷ 333.33 = 1200.012…, not 1000 ÷ 0.83 = 1204.82
        assertThat(evm.eac()).isEqualTo(Money.of("1200.01", "USD"));
    }

    @Test
    void figuresThatWouldDivideByZeroAreLeftOutWithTheReason() {
        EarnedValueAnalysis evm =
                EarnedValueAnalysis.of(rwf("100000"), rwf("0"), rwf("0"), null, rwf("0"), EacMethod.TYPICAL);

        assertThat(evm.spi()).isNull();
        assertThat(evm.cpi()).isNull();
        assertThat(evm.eac()).isNull();
        assertThat(evm.unavailable())
                .extracting(Unavailable::metric)
                .containsExactly("spi", "cpi", "eac", "etc", "vac");
        assertThat(evm.tcpi()).isEqualByComparingTo("1.00");
    }

    @Test
    void withoutEarnedValueOnlyTheInputsRemain() {
        EarnedValueAnalysis evm = EarnedValueAnalysis.of(
                rwf("100000"), rwf("20000"), null, "No story points are estimated yet", rwf("5000"), EacMethod.TYPICAL);

        assertThat(evm.pv()).isEqualTo(rwf("20000"));
        assertThat(evm.ac()).isEqualTo(rwf("5000"));
        assertThat(evm.unavailable())
                .hasSize(9)
                .allSatisfy(missing -> assertThat(missing.reason()).isEqualTo("No story points are estimated yet"));
    }

    @Test
    void thePercentCompleteMethodDecidesWhatCountsAsEarned() {
        List<WorkPackage> work = List.of(
                new WorkPackage(rwf("1000"), BigDecimal.valueOf(100)),
                new WorkPackage(rwf("2000"), BigDecimal.valueOf(40)),
                new WorkPackage(rwf("4000"), BigDecimal.ZERO));
        Money bac = rwf("7000");

        assertThat(PercentCompleteMethod.PHYSICAL.earned(work, bac, 0, 0)).contains(rwf("1800"));
        assertThat(PercentCompleteMethod.ZERO_HUNDRED.earned(work, bac, 0, 0)).contains(rwf("1000"));
        assertThat(PercentCompleteMethod.FIFTY_FIFTY.earned(work, bac, 0, 0)).contains(rwf("2000"));
        assertThat(PercentCompleteMethod.STORY_POINTS.earned(work, bac, 13, 20)).contains(rwf("4550"));
        assertThat(PercentCompleteMethod.STORY_POINTS.earned(work, bac, 0, 0)).isEmpty();
    }

    @Test
    void plannedValueSpreadsEachBudgetEvenlyOverItsWindow() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        List<PlannedWork> work = List.of(
                new PlannedWork(rwf("1000"), start, start.plusDays(9)),
                new PlannedWork(rwf("500"), start.plusDays(10), start.plusDays(14)));

        assertThat(PlannedValue.asOf(work, start.minusDays(1), "RWF")).isEqualTo(rwf("0"));
        assertThat(PlannedValue.asOf(work, start, "RWF")).isEqualTo(rwf("100"));
        assertThat(PlannedValue.asOf(work, start.plusDays(4), "RWF")).isEqualTo(rwf("500"));
        assertThat(PlannedValue.asOf(work, start.plusDays(11), "RWF")).isEqualTo(rwf("1200"));
        assertThat(PlannedValue.asOf(work, start.plusDays(30), "RWF")).isEqualTo(rwf("1500"));
    }

    private Money eac(EacMethod method) {
        return EarnedValueAnalysis.of(rwf("100000"), rwf("50000"), rwf("40000"), null, rwf("45000"), method)
                .eac();
    }
}
