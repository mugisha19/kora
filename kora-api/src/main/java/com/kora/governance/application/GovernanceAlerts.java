package com.kora.governance.application;

import com.kora.governance.IssueEscalated;
import com.kora.governance.RiskReviewOverdue;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueStatus;
import com.kora.governance.domain.Risk;
import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectQueries.ProjectKey;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Raises the time-based governance alerts (features 11–12): risks past their review date, once a day each, and
 * critical issues unresolved for more than three days, once each. Their keys make repeated runs harmless; the
 * notifications module turns them into notifications through the outbox.
 */
@Component
public class GovernanceAlerts {

    private static final Logger LOG = LoggerFactory.getLogger(GovernanceAlerts.class);

    private final RiskRepository risks;
    private final IssueRepository issues;
    private final ProjectQueries projects;
    private final TenantTransactions transactions;
    private final OrganizationTimeZone timeZone;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    GovernanceAlerts(
            RiskRepository risks,
            IssueRepository issues,
            ProjectQueries projects,
            TenantTransactions transactions,
            OrganizationTimeZone timeZone,
            ApplicationEventPublisher events,
            Clock clock) {
        this.risks = risks;
        this.issues = issues;
        this.projects = projects;
        this.transactions = transactions;
        this.timeZone = timeZone;
        this.events = events;
        this.clock = clock;
    }

    @Scheduled(
            initialDelayString = "${kora.governance.alerts.initial-delay:PT15M}",
            fixedDelayString = "${kora.governance.alerts.interval:PT1H}")
    public void raiseAll() {
        Set<UUID> organizations = transactions.readInSystem(projects::allProjects).stream()
                .map(ProjectKey::organizationId)
                .collect(Collectors.toSet());
        for (UUID organization : organizations) {
            try {
                transactions.inOrganization(organization, () -> {
                    raise(organization);
                    return null;
                });
            } catch (RuntimeException failure) {
                LOG.warn("Could not raise the governance alerts of organization {}", organization, failure);
            }
        }
    }

    /** Raises the active organization's alerts; public for the job and for tests. */
    public void raise(UUID organization) {
        LocalDate today = LocalDate.now(clock.withZone(timeZone.zone()));
        Instant now = clock.instant();
        for (Risk risk : risks.search(new RiskSearch(null, null, null, null, null, null, null, true))) {
            if (risk.isReviewOverdue(today) && risk.getOwnerId() != null) {
                events.publishEvent(new RiskReviewOverdue(
                        "risk-review:" + risk.getId() + ":" + today,
                        organization,
                        risk.getProjectId(),
                        risk.getId(),
                        risk.getKey(),
                        risk.getTitle(),
                        risk.getOwnerId(),
                        risk.getReviewDate()));
            }
        }
        List<Issue> critical = issues.findByPriorityAndStatusIn(
                IssuePriority.CRITICAL, EnumSet.of(IssueStatus.OPEN, IssueStatus.IN_PROGRESS));
        for (Issue issue : critical) {
            if (issue.isEscalated(now)) {
                events.publishEvent(new IssueEscalated(
                        "issue-escalated:" + issue.getId(),
                        organization,
                        issue.getProjectId(),
                        issue.getId(),
                        issue.getKey(),
                        issue.getTitle()));
            }
        }
    }
}
