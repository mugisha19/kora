package com.kora.portfolio;

import com.kora.platform.money.Money;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Integrated change control's view of a project (feature 14): what a change is measured against, and applying an
 * approved change to the project's baselines. No access checks: the change request's approval chain is the
 * authorization.
 */
public interface ProjectChangeControl {

    Baseline baseline(UUID projectId);

    /** Applies the change to the budget, target end date and (when asked) the charter, and publishes the change. */
    void apply(UUID projectId, ApprovedChange change);

    /**
     * @param budget null when the project has no budget
     * @param sponsorId the current charter's sponsor, or null
     */
    record Baseline(UUID managerId, UUID sponsorId, Money budget, LocalDate startDate, LocalDate targetEndDate) {}

    /**
     * @param costDelta added to the budget (and to the charter's summary budget); null for none
     * @param newTargetEndDate null to keep the current one
     * @param scopeAddition added to the charter's in-scope list when {@code amendCharter}
     */
    record ApprovedChange(
            String reference,
            Money costDelta,
            LocalDate newTargetEndDate,
            String scopeAddition,
            boolean amendCharter,
            UUID approvedBy) {}
}
