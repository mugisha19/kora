package com.kora.governance;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/** Read access for the dashboard read model. No access check: callers work in the tenant scope. */
public interface GovernanceQueries {

    /**
     * Whether an open critical risk (score 15 or more) is past its review date, or still has no response plan a week
     * after it was raised, as of {@code today}.
     */
    boolean criticalRiskOverdue(UUID projectId, LocalDate today);

    /** Open risks scoring 15 or more. */
    int openCriticalRisks(UUID projectId);

    /** Change requests submitted or in review. */
    int pendingChangeRequests(UUID projectId);

    /** The kinds of governance item other modules may hang things on (attachments). */
    enum Item {
        RISK,
        ISSUE,
        CHANGE_REQUEST
    }

    /** The project of a risk, issue or change request of the active organization; empty when there's none. */
    Optional<UUID> projectOf(Item item, UUID id);
}
