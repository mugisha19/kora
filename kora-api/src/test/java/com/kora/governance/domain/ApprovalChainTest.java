package com.kora.governance.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.governance.domain.ApprovalHandler.ChangeContext;
import com.kora.governance.domain.ApprovalHandler.StepPlan;
import com.kora.governance.domain.ApprovalHandler.Thresholds;
import com.kora.organization.Role;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.ProblemException;
import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Feature 14: which levels a change needs (Chain of Responsibility), and deciding them in order. */
class ApprovalChainTest {

    private static final Instant NOW = Instant.parse("2026-09-27T08:00:00Z");
    private static final Thresholds STANDARD = new Thresholds(new BigDecimal("5"), 10, new BigDecimal("15"));
    private static final Money BUDGET = Money.of("10000000", "RWF");

    private final UUID requester = UUID.randomUUID();
    private final UUID manager = UUID.randomUUID();
    private final UUID sponsor = UUID.randomUUID();
    private final ApprovalHandler chain = ApprovalHandler.standardChain();

    @Test
    void aSmallChangeNeedsOnlyTheProjectManager() {
        assertThat(levels(context(BUDGET, "300000", 2, false))).containsExactly(ApprovalLevel.PROJECT_MANAGER);
    }

    @Test
    void aLargeChangeNeedsTheProjectManagerThenThePmoThenTheSponsor() {
        List<StepPlan> steps = chain.chainFor(context(BUDGET, "2000000", 0, false));

        assertThat(steps)
                .extracting(StepPlan::level)
                .containsExactly(ApprovalLevel.PROJECT_MANAGER, ApprovalLevel.PMO, ApprovalLevel.SPONSOR);
        assertThat(steps.get(1).reason()).isEqualTo("Cost change of 20% of the budget exceeds 5%");
        assertThat(steps.get(2).approverId()).isEqualTo(sponsor);
    }

    @Test
    void theThresholdsAreStrict() {
        assertThat(levels(context(BUDGET, "500000", 10, false))).containsExactly(ApprovalLevel.PROJECT_MANAGER);
        assertThat(levels(context(BUDGET, "500000", 11, false)))
                .containsExactly(ApprovalLevel.PROJECT_MANAGER, ApprovalLevel.PMO);
        assertThat(levels(context(BUDGET, "-800000", 0, false)))
                .containsExactly(ApprovalLevel.PROJECT_MANAGER, ApprovalLevel.PMO);
    }

    @Test
    void changingTheCharterScopeNeedsTheSponsor() {
        assertThat(levels(context(BUDGET, null, 0, true)))
                .containsExactly(ApprovalLevel.PROJECT_MANAGER, ApprovalLevel.SPONSOR);
    }

    @Test
    void withoutABudgetAnyCostChangeGoesAllTheWayUp() {
        List<StepPlan> steps = chain.chainFor(context(null, "1", 0, false));

        assertThat(steps).hasSize(3);
        assertThat(steps.get(1).reason()).isEqualTo("Cost change without a project budget to compare it with");
    }

    @Test
    void nobodyGetsToApproveTheirOwnRequest() {
        List<StepPlan> byManager = chain.chainFor(
                new ChangeContext(manager, manager, sponsor, BUDGET, Money.of("2000000", "RWF"), 0, false, STANDARD));
        assertThat(byManager.getFirst().approverRole()).isEqualTo(Role.PMO);
        assertThat(byManager.getFirst().approverId()).isNull();

        List<StepPlan> bySponsor = chain.chainFor(
                new ChangeContext(sponsor, manager, sponsor, BUDGET, Money.of("2000000", "RWF"), 0, false, STANDARD));
        assertThat(bySponsor.getLast().approverRole()).isEqualTo(Role.ORG_ADMIN);
    }

    @Test
    void stepsAreDecidedInOrderAndTheLastApprovalFinishesIt() {
        ChangeRequest request = submitted(context(BUDGET, "800000", 0, false));
        UUID pmo = UUID.randomUUID();

        assertThat(request.decide(Decision.APPROVE, null, manager, Role.PROJECT_MANAGER, NOW))
                .isFalse();
        assertThat(request.getStatus()).isEqualTo(ChangeRequestStatus.IN_REVIEW);
        assertThat(request.getSteps())
                .extracting(ApprovalStep::getState)
                .containsExactly(StepState.APPROVED, StepState.PENDING);
        assertThatThrownBy(() -> request.decide(Decision.APPROVE, null, manager, Role.PROJECT_MANAGER, NOW))
                .isInstanceOf(ForbiddenException.class);

        assertThat(request.decide(Decision.APPROVE, "Fine", pmo, Role.PMO, NOW)).isTrue();
        assertThat(request.getStatus()).isEqualTo(ChangeRequestStatus.APPROVED);
        assertThat(request.getDecidedAt()).isEqualTo(NOW);
    }

    @Test
    void aRejectionNeedsAReasonAndStopsTheChain() {
        ChangeRequest request = submitted(context(BUDGET, "2000000", 0, false));

        assertThatThrownBy(() -> request.decide(Decision.REJECT, " ", manager, Role.PROJECT_MANAGER, NOW))
                .isInstanceOf(InvalidInputException.class);
        request.decide(Decision.REJECT, "Not worth it", manager, Role.PROJECT_MANAGER, NOW);

        assertThat(request.getStatus()).isEqualTo(ChangeRequestStatus.REJECTED);
        assertThat(request.getSteps())
                .extracting(ApprovalStep::getState)
                .containsExactly(StepState.REJECTED, StepState.SKIPPED, StepState.SKIPPED);
        assertThatThrownBy(() -> request.decide(Decision.APPROVE, null, manager, Role.PROJECT_MANAGER, NOW))
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("change_requests.not_in_review");
    }

    @Test
    void theRequesterCantDecideEvenWithTheRightRole() {
        ChangeRequest request = submitted(
                new ChangeContext(requester, manager, sponsor, BUDGET, Money.of("800000", "RWF"), 0, false, STANDARD));
        request.decide(Decision.APPROVE, null, manager, Role.PROJECT_MANAGER, NOW);

        assertThatThrownBy(() -> request.decide(Decision.APPROVE, null, requester, Role.PMO, NOW))
                .isInstanceOf(ConflictException.class)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("change_requests.self_approval");
        assertThat(request.awaits(requester, Role.PMO)).isFalse();
        assertThat(request.awaits(UUID.randomUUID(), Role.ORG_ADMIN)).isTrue();
    }

    @Test
    void aRejectedRequestIsRevisedAsANewDraftWithTheSameKey() {
        ChangeRequest request = submitted(context(BUDGET, "300000", 0, false));
        assertThatThrownBy(() -> request.revise(requester, NOW)).isInstanceOf(ConflictException.class);
        request.decide(Decision.REJECT, "Needs numbers", manager, Role.PROJECT_MANAGER, NOW);

        ChangeRequest revision = request.revise(requester, NOW);

        assertThat(revision.getKey()).isEqualTo(request.getKey());
        assertThat(revision.getRevision()).isEqualTo(2);
        assertThat(revision.getPreviousRevisionId()).isEqualTo(request.getId());
        assertThat(revision.getStatus()).isEqualTo(ChangeRequestStatus.DRAFT);
        assertThat(revision.impact()).isEqualTo(request.impact());
    }

    @Test
    void onlyDraftsAreEditedAndOnlyUndecidedRequestsWithdrawn() {
        ChangeRequest request = submitted(context(BUDGET, "300000", 0, false));

        assertThatThrownBy(() -> request.edit("New title", null, null, null, null))
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("change_requests.not_draft");
        request.withdraw();
        assertThat(request.getSteps()).extracting(ApprovalStep::getState).containsOnly(StepState.SKIPPED);
        assertThatThrownBy(request::implement)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("change_requests.invalid_transition");
    }

    private List<ApprovalLevel> levels(ChangeContext context) {
        return chain.chainFor(context).stream().map(StepPlan::level).toList();
    }

    private ChangeContext context(Money budget, String cost, int days, boolean charter) {
        return new ChangeContext(
                requester,
                manager,
                sponsor,
                budget,
                cost == null ? null : Money.of(cost, "RWF"),
                days,
                charter,
                STANDARD);
    }

    private ChangeRequest submitted(ChangeContext context) {
        ChangeRequest request = ChangeRequest.draft(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "AKG-CR1",
                1,
                "More testers",
                "Quality is slipping",
                ChangeRequestType.COST,
                context.requesterId(),
                null,
                NOW);
        request.setImpact(new ChangeRequest.Impact(context.costDelta(), 0, null, null, false));
        request.submit(chain.chainFor(context), NOW);
        return request;
    }
}
