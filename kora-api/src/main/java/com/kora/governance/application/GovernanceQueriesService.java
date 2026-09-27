package com.kora.governance.application;

import com.kora.governance.GovernanceQueries;
import com.kora.governance.domain.ChangeRequest;
import com.kora.governance.domain.ChangeRequestStatus;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.Risk;
import com.kora.governance.domain.RiskStatus;
import com.kora.governance.domain.Severity;
import com.kora.organization.OrganizationTimeZone;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class GovernanceQueriesService implements GovernanceQueries {

    private final RiskRepository risks;
    private final IssueRepository issues;
    private final ChangeRequestRepository requests;
    private final OrganizationTimeZone timeZone;

    GovernanceQueriesService(
            RiskRepository risks,
            IssueRepository issues,
            ChangeRequestRepository requests,
            OrganizationTimeZone timeZone) {
        this.risks = risks;
        this.issues = issues;
        this.requests = requests;
        this.timeZone = timeZone;
    }

    @Override
    @Transactional(readOnly = true)
    public List<RiskLine> topOpenRisks(UUID projectId, int limit) {
        return risks.findByProjectIdAndStatusNot(projectId, RiskStatus.CLOSED).stream()
                .filter(Risk::isOpen)
                .sorted(Comparator.comparingInt(Risk::score).reversed().thenComparing(Risk::getKey))
                .limit(limit)
                .map(risk -> new RiskLine(
                        risk.getKey(),
                        risk.getTitle(),
                        risk.score(),
                        risk.severity().name(),
                        risk.getStatus().name(),
                        risk.getOwnerId(),
                        risk.getReviewDate()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<IssueLine> openIssues(UUID projectId, int limit) {
        return issues.search(new IssueSearch(projectId, null, null, null, null, null), PageRequest.of(0, 500)).stream()
                .filter(issue -> issue.getStatus().isUnresolved())
                .sorted(Comparator.comparing(Issue::getPriority)
                        .reversed()
                        .thenComparing(Issue::getDueDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(limit)
                .map(issue -> new IssueLine(
                        issue.getKey(),
                        issue.getTitle(),
                        issue.getPriority().name(),
                        issue.getStatus().name(),
                        issue.getOwnerId(),
                        issue.getDueDate()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> projectOf(Item item, UUID id) {
        return switch (item) {
            case RISK -> risks.findById(id).map(Risk::getProjectId);
            case ISSUE -> issues.findById(id).map(Issue::getProjectId);
            case CHANGE_REQUEST -> requests.findById(id).map(ChangeRequest::getProjectId);
        };
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
