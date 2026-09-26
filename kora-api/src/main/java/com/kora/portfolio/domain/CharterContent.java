package com.kora.portfolio.domain;

import com.kora.platform.money.Money;
import java.util.List;
import java.util.UUID;

/** Everything a project manager writes in a charter; replaced as a whole while the charter is a draft. */
public record CharterContent(
        String purpose,
        String businessCase,
        List<CharterObjective> objectives,
        List<String> inScope,
        List<String> outOfScope,
        List<String> assumptions,
        List<String> constraints,
        List<String> highLevelRisks,
        List<CharterMilestone> milestones,
        Money summaryBudget,
        UUID sponsorId) {

    public CharterContent {
        objectives = copy(objectives);
        inScope = copy(inScope);
        outOfScope = copy(outOfScope);
        assumptions = copy(assumptions);
        constraints = copy(constraints);
        highLevelRisks = copy(highLevelRisks);
        milestones = copy(milestones);
    }

    public static CharterContent empty() {
        return new CharterContent(null, null, null, null, null, null, null, null, null, null, null);
    }

    private static <T> List<T> copy(List<T> list) {
        return list == null ? List.of() : List.copyOf(list);
    }
}
