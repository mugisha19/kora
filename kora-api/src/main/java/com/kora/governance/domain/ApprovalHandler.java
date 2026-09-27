package com.kora.governance.domain;

import com.kora.organization.Role;
import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Chain of Responsibility (feature 14): each handler decides whether its level must approve a change and passes the
 * request on. Adding a level (legal review above some amount) is one new handler linked into the chain, not another
 * branch in a growing if/else.
 */
public abstract class ApprovalHandler {

    private ApprovalHandler next;

    /** The standard chain: project manager, then PMO, then sponsor. */
    public static ApprovalHandler standardChain() {
        ApprovalHandler first = new ProjectManagerApproval();
        first.then(new PmoApproval()).then(new SponsorApproval());
        return first;
    }

    /** Links {@code handler} after this one and returns it, so a chain reads left to right. */
    public ApprovalHandler then(ApprovalHandler handler) {
        this.next = handler;
        return handler;
    }

    /** The steps the change needs, in order. */
    public final List<StepPlan> chainFor(ChangeContext change) {
        List<StepPlan> plan = new ArrayList<>();
        for (ApprovalHandler handler = this; handler != null; handler = handler.next) {
            handler.stepFor(change).ifPresent(plan::add);
        }
        return plan;
    }

    protected abstract Optional<StepPlan> stepFor(ChangeContext change);

    /** Exactly one of {@code approverId} and {@code approverRole} is set. */
    public record StepPlan(ApprovalLevel level, String reason, UUID approverId, Role approverRole) {}

    /** What the handlers look at; thresholds are the organization's change-control settings. */
    public record ChangeContext(
            UUID requesterId,
            UUID managerId,
            UUID sponsorId,
            Money budget,
            Money costDelta,
            int scheduleDeltaDays,
            boolean changesCharterScope,
            Thresholds thresholds) {

        /**
         * The cost change as a percentage of the budget, or empty when there is no cost change. Without a budget,
         * any cost change is treated as larger than every threshold.
         */
        Optional<BigDecimal> costPercent() {
            if (costDelta == null || costDelta.amount().signum() == 0) {
                return Optional.empty();
            }
            if (budget == null || budget.amount().signum() == 0) {
                return Optional.of(BigDecimal.valueOf(Long.MAX_VALUE));
            }
            return Optional.of(costDelta
                    .amount()
                    .abs()
                    .multiply(BigDecimal.valueOf(100))
                    .divide(budget.amount(), 2, RoundingMode.HALF_EVEN));
        }

        boolean costAbove(BigDecimal percent) {
            return costPercent().filter(share -> share.compareTo(percent) > 0).isPresent();
        }

        String costReason(BigDecimal limit) {
            return budget == null || budget.amount().signum() == 0
                    ? "Cost change without a project budget to compare it with"
                    : "Cost change of "
                            + costPercent().orElseThrow().stripTrailingZeros().toPlainString()
                            + "% of the budget exceeds "
                            + limit.stripTrailingZeros().toPlainString() + "%";
        }
    }

    public record Thresholds(BigDecimal pmoCostPercent, int pmoScheduleDays, BigDecimal sponsorCostPercent) {}

    /** Always: the project manager confirms the impact analysis. */
    static final class ProjectManagerApproval extends ApprovalHandler {
        @Override
        protected Optional<StepPlan> stepFor(ChangeContext change) {
            if (change.managerId().equals(change.requesterId())) {
                return Optional.of(new StepPlan(
                        ApprovalLevel.PROJECT_MANAGER,
                        "The project manager requested it, so the PMO confirms the analysis instead",
                        null,
                        Role.PMO));
            }
            return Optional.of(new StepPlan(
                    ApprovalLevel.PROJECT_MANAGER,
                    "The project manager confirms the impact analysis",
                    change.managerId(),
                    null));
        }
    }

    /** A cost or schedule change above the PMO thresholds. */
    static final class PmoApproval extends ApprovalHandler {
        @Override
        protected Optional<StepPlan> stepFor(ChangeContext change) {
            Thresholds limits = change.thresholds();
            if (change.costAbove(limits.pmoCostPercent())) {
                return Optional.of(
                        new StepPlan(ApprovalLevel.PMO, change.costReason(limits.pmoCostPercent()), null, Role.PMO));
            }
            if (Math.abs(change.scheduleDeltaDays()) > limits.pmoScheduleDays()) {
                return Optional.of(new StepPlan(
                        ApprovalLevel.PMO,
                        "Schedule change of " + Math.abs(change.scheduleDeltaDays()) + " working days exceeds "
                                + limits.pmoScheduleDays(),
                        null,
                        Role.PMO));
            }
            return Optional.empty();
        }
    }

    /** A cost change above the sponsor threshold, or any change to the charter's scope. */
    static final class SponsorApproval extends ApprovalHandler {
        @Override
        protected Optional<StepPlan> stepFor(ChangeContext change) {
            Thresholds limits = change.thresholds();
            String reason;
            if (change.costAbove(limits.sponsorCostPercent())) {
                reason = change.costReason(limits.sponsorCostPercent());
            } else if (change.changesCharterScope()) {
                reason = "It changes the scope in the charter the sponsor approved";
            } else {
                return Optional.empty();
            }
            UUID sponsor = change.sponsorId();
            if (sponsor == null || sponsor.equals(change.requesterId())) {
                return Optional.of(new StepPlan(
                        ApprovalLevel.SPONSOR,
                        reason
                                + (sponsor == null
                                        ? "; there is no sponsor, so an administrator decides"
                                        : "; the sponsor requested it, so an administrator decides"),
                        null,
                        Role.ORG_ADMIN));
            }
            return Optional.of(new StepPlan(ApprovalLevel.SPONSOR, reason, sponsor, null));
        }
    }
}
