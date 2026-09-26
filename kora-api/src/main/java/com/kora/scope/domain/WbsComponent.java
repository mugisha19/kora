package com.kora.scope.domain;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Composite pattern (feature 07): a work package (leaf) and a deliverable (composite) answer the same four questions,
 * so a single node, a subtree and the whole project roll up with the same code.
 */
public sealed interface WbsComponent permits WbsComponent.WorkPackage, WbsComponent.Deliverable {

    BigDecimal HUNDRED = BigDecimal.valueOf(100);

    BigDecimal plannedEffortHours();

    Money plannedCost();

    /** 0–100, with two decimals. */
    BigDecimal percentComplete();

    /** Earned value: the budget of the work actually done (planned cost × percent complete). */
    Money earnedValue();

    /** A leaf: its own planned figures and reported progress (physical percent complete, until tasks exist). */
    record WorkPackage(BigDecimal plannedEffortHours, Money plannedCost, BigDecimal percentComplete)
            implements WbsComponent {

        @Override
        public Money earnedValue() {
            return plannedCost.times(percentComplete.divide(HUNDRED));
        }
    }

    /** A group: every figure comes from its children. */
    record Deliverable(List<WbsComponent> children, String currency) implements WbsComponent {

        public Deliverable {
            children = List.copyOf(children);
        }

        @Override
        public BigDecimal plannedEffortHours() {
            return children.stream().map(WbsComponent::plannedEffortHours).reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        @Override
        public Money plannedCost() {
            return children.stream().map(WbsComponent::plannedCost).reduce(Money.zero(currency), Money::plus);
        }

        @Override
        public Money earnedValue() {
            return children.stream().map(WbsComponent::earnedValue).reduce(Money.zero(currency), Money::plus);
        }

        /**
         * Weighted by planned effort, so finishing a 200-hour package counts ten times more than a 20-hour one. With no
         * effort planned anywhere below, every child weighs the same.
         */
        @Override
        public BigDecimal percentComplete() {
            if (children.isEmpty()) {
                return BigDecimal.ZERO.setScale(2);
            }
            BigDecimal totalEffort = plannedEffortHours();
            if (totalEffort.signum() == 0) {
                BigDecimal sum =
                        children.stream().map(WbsComponent::percentComplete).reduce(BigDecimal.ZERO, BigDecimal::add);
                return sum.divide(BigDecimal.valueOf(children.size()), 2, RoundingMode.HALF_EVEN);
            }
            BigDecimal weighted = children.stream()
                    .map(child -> child.percentComplete().multiply(child.plannedEffortHours()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            return weighted.divide(totalEffort, 2, RoundingMode.HALF_EVEN);
        }
    }
}
