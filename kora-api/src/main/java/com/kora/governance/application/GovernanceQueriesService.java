package com.kora.governance.application;

import com.kora.governance.GovernanceQueries;
import com.kora.governance.domain.RiskStatus;
import com.kora.organization.OrganizationTimeZone;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class GovernanceQueriesService implements GovernanceQueries {

    private final RiskRepository risks;
    private final OrganizationTimeZone timeZone;

    GovernanceQueriesService(RiskRepository risks, OrganizationTimeZone timeZone) {
        this.risks = risks;
        this.timeZone = timeZone;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean criticalRiskOverdue(UUID projectId, LocalDate today) {
        return risks.findByProjectIdAndStatusNot(projectId, RiskStatus.CLOSED).stream()
                .anyMatch(risk -> risk.isCriticalAndOverdue(today, timeZone.zone()));
    }
}
