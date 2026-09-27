package com.kora.governance;

import java.time.LocalDate;
import java.util.UUID;

/** Read access for the dashboard read model. No access check: callers work in the tenant scope. */
public interface GovernanceQueries {

    /**
     * Whether an open critical risk (score 15 or more) is past its review date, or still has no response plan a week
     * after it was raised, as of {@code today}.
     */
    boolean criticalRiskOverdue(UUID projectId, LocalDate today);
}
