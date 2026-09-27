package com.kora.governance.application;

import com.kora.governance.GovernanceQueries;
import com.kora.governance.domain.ChangeRequestStatus;
import com.kora.governance.domain.RiskStatus;
import com.kora.governance.domain.Severity;
import com.kora.organization.OrganizationTimeZone;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class GovernanceQueriesService implements GovernanceQueries {

    private final RiskRepository risks;
    private final ChangeRequestRepository requests;
    private final OrganizationTimeZone timeZone;

    GovernanceQueriesService(RiskRepository risks, ChangeRequestRepository requests, OrganizationTimeZone timeZone) {
        this.risks = risks;
        this.requests = requests;
        this.timeZone = timeZone;
    }

    @Override
    @Transactional(readOnly = true)
    public int openCriticalRisks(UUID projectId) {
        return (int) risks.findByProjectIdAndStatusNot(projectId, RiskStatus.CLOSED).stream()
                .filter(risk -> risk.severity() == Severity.CRITICAL)
                .count();
    }

    @Override
    @Transactional(readOnly = true)
    public int pendingChangeRequests(UUID projectId) {
        return (int) requests.countByProjectIdAndStatusIn(
                projectId, EnumSet.of(ChangeRequestStatus.SUBMITTED, ChangeRequestStatus.IN_REVIEW));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean criticalRiskOverdue(UUID projectId, LocalDate today) {
        return risks.findByProjectIdAndStatusNot(projectId, RiskStatus.CLOSED).stream()
                .anyMatch(risk -> risk.isCriticalAndOverdue(today, timeZone.zone()));
    }
}
