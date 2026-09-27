package com.kora.performance.domain;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

/**
 * Strategy pattern (feature 17): how much of the planned budget counts as earned. Chosen per project; each rule is
 * a textbook one, so the numbers can be defended.
 */
public enum PercentCompleteMethod {
    /** A work package earns its percent complete (measured from tasks, or reported). */
    PHYSICAL {
        @Override
        BigDecimal share(BigDecimal percent) {
            return percent.divide(HUNDRED, 6, RoundingMode.HALF_EVEN);
        }
    },
    /** Nothing until complete: the most conservative rule, for short work packages. */
    ZERO_HUNDRED {
        @Override
        BigDecimal share(BigDecimal percent) {
            return percent.compareTo(HUNDRED) >= 0 ? BigDecimal.ONE : BigDecimal.ZERO;
        }
    },
    /** Half when started, all when complete. */
    FIFTY_FIFTY {
        @Override
        BigDecimal share(BigDecimal percent) {
            if (percent.compareTo(HUNDRED) >= 0) {
                return BigDecimal.ONE;
            }
            return percent.signum() > 0 ? HALF : BigDecimal.ZERO;
        }
    },
    /** The project's budget in proportion to finished story points (Agile). */
    STORY_POINTS {
        @Override
        BigDecimal share(BigDecimal percent) {
            throw new UnsupportedOperationException("Story points are counted for the whole project");
        }

        @Override
        public Optional<Money> earned(List<WorkPackage> workPackages, Money bac, int donePoints, int totalPoints) {
            if (totalPoints == 0) {
                return Optional.empty();
            }
            return Optional.of(bac.times(
                    BigDecimal.valueOf(donePoints).divide(BigDecimal.valueOf(totalPoints), 6, RoundingMode.HALF_EVEN)));
        }
    };

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final BigDecimal HALF = new BigDecimal("0.5");

    /** A work package's planned cost and percent complete (0–100). */
    public record WorkPackage(Money plannedCost, BigDecimal percentComplete) {}

    abstract BigDecimal share(BigDecimal percent);

    /** Earned value; empty when the method has nothing to measure with (no story points estimated). */
    public Optional<Money> earned(List<WorkPackage> workPackages, Money bac, int donePoints, int totalPoints) {
        return Optional.of(workPackages.stream()
                .map(wp -> wp.plannedCost().times(share(wp.percentComplete())))
                .reduce(Money.zero(bac.currency()), Money::plus));
    }
}
