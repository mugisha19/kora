package com.kora.portfolio;

import com.kora.platform.money.Money;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** What the dashboard read model needs to know about one project from this module. */
public record ProjectSnapshotSource(
        UUID projectId,
        UUID portfolioId,
        UUID programId,
        String code,
        String name,
        UUID managerId,
        String methodology,
        String status,
        LocalDate startDate,
        LocalDate targetEndDate,
        Money budget,
        Health healthOverride,
        String healthOverrideReason,
        List<Milestone> charterMilestones) {

    public ProjectSnapshotSource {
        charterMilestones = List.copyOf(charterMilestones);
    }

    public record Milestone(String name, LocalDate targetDate) {}
}
