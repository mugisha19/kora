package com.kora.governance;

import java.time.LocalDate;
import java.util.UUID;

/** An open risk passed its review date; raised once a day while it stays overdue. */
public record RiskReviewOverdue(
        String eventKey,
        UUID organizationId,
        UUID projectId,
        UUID riskId,
        String key,
        String title,
        UUID ownerId,
        LocalDate reviewDate) {}
