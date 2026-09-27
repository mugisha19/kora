package com.kora.governance.application;

import com.kora.governance.domain.RiskCategory;
import com.kora.governance.domain.RiskKind;
import com.kora.governance.domain.RiskStatus;
import java.util.Set;
import java.util.UUID;

/**
 * Risk filters; null means "any".
 *
 * @param projectIds the projects to look in; null for every project of the organization
 * @param openOnly leave out closed risks (the heat map and the portfolio view)
 */
public record RiskSearch(
        Set<UUID> projectIds,
        RiskStatus status,
        RiskKind kind,
        RiskCategory category,
        UUID ownerId,
        Integer minScore,
        String q,
        boolean openOnly) {}
