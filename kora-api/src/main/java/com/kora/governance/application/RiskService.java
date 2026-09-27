package com.kora.governance.application;

import com.kora.governance.RiskChanged;
import com.kora.governance.domain.GovernanceSequence;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueType;
import com.kora.governance.domain.ResponseStrategy;
import com.kora.governance.domain.Risk;
import com.kora.governance.domain.RiskAssessment;
import com.kora.governance.domain.RiskCategory;
import com.kora.governance.domain.RiskClosure;
import com.kora.governance.domain.RiskKind;
import com.kora.governance.domain.RiskProximity;
import com.kora.governance.domain.RiskStatus;
import com.kora.governance.domain.Severity;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectRef;
import com.kora.portfolio.ProjectVisibility;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The risk register (feature 11). Everyone on the project reads it and its managers and contributors raise risks; a
 * risk's owner or the project's managers change it. Every scoring is kept as an assessment.
 */
@Service
public class RiskService {

    static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by(Sort.Order.desc("score"), Sort.Order.asc("number")))
            .allow("score")
            .allow("key", "number")
            .allow("reviewDate")
            .allow("createdAt");

    private final RiskRepository risks;
    private final RiskAssessmentRepository assessments;
    private final IssueRepository issues;
    private final ProjectAccess projects;
    private final ProjectQueries projectQueries;
    private final GovernanceSupport support;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    RiskService(
            RiskRepository risks,
            RiskAssessmentRepository assessments,
            IssueRepository issues,
            ProjectAccess projects,
            ProjectQueries projectQueries,
            GovernanceSupport support,
            ApplicationEventPublisher events,
            Clock clock) {
        this.risks = risks;
        this.assessments = assessments;
        this.issues = issues;
        this.projects = projects;
        this.projectQueries = projectQueries;
        this.support = support;
        this.events = events;
        this.clock = clock;
    }

    public record NewRisk(
            String title,
            String description,
            RiskKind kind,
            RiskCategory category,
            RiskProximity proximity,
            int probability,
            int impact,
            UUID ownerId,
            ResponseStrategy responseStrategy,
            String responsePlan,
            String triggerConditions,
            LocalDate reviewDate) {}

    /** Null fields stay as they are. */
    public record RiskChanges(
            String title,
            String description,
            RiskCategory category,
            RiskProximity proximity,
            UUID ownerId,
            ResponseStrategy responseStrategy,
            String responsePlan,
            String triggerConditions,
            LocalDate reviewDate,
            RiskStatus status) {}

    public record Assessment(
            int probability, int impact, Integer residualProbability, Integer residualImpact, String note) {}

    public record NewIssueFromRisk(String title, IssuePriority priority, UUID ownerId, LocalDate dueDate) {}

    /** One cell of the 5 × 5 heat map. */
    public record HeatmapCell(int probability, int impact, int score, Severity severity, List<UUID> riskIds) {}

    @Transactional(readOnly = true)
    public Page<Risk> list(UUID projectId, RiskSearch filters, Pageable pageable) {
        projects.readable(projectId);
        return risks.search(filters, SORT.apply(pageable));
    }

    /** Open risks across the projects the caller can see, optionally within one portfolio (the PMO's view). */
    @Transactional(readOnly = true)
    public Page<Risk> portfolio(UUID portfolioId, Integer minScore, Pageable pageable) {
        ProjectVisibility visibility = projects.visibility();
        Set<UUID> scope = null;
        if (portfolioId != null) {
            scope = new HashSet<>(projectQueries.projectIdsOfPortfolio(portfolioId));
            scope.removeIf(id -> !visibility.includes(id));
        } else if (!visibility.all()) {
            scope = visibility.projectIds();
        }
        int threshold = minScore == null ? Severity.CRITICAL_FROM : minScore;
        return risks.search(new RiskSearch(scope, null, null, null, null, threshold, null, true), SORT.apply(pageable));
    }

    /** Rows from probability 5 down to 1, impact 1 to 5 within a row, as the heat map is drawn. */
    @Transactional(readOnly = true)
    public List<HeatmapCell> heatmap(UUID projectId, RiskKind kind, RiskCategory category, UUID ownerId) {
        projects.readable(projectId);
        Map<Integer, List<UUID>> byCell =
                risks
                        .search(new RiskSearch(Set.of(projectId), null, kind, category, ownerId, null, null, true))
                        .stream()
                        .collect(Collectors.groupingBy(
                                risk -> cell(risk.getProbability(), risk.getImpact()),
                                Collectors.mapping(Risk::getId, Collectors.toList())));
        List<HeatmapCell> cells = new ArrayList<>(25);
        for (int probability = 5; probability >= 1; probability--) {
            for (int impact = 1; impact <= 5; impact++) {
                int score = probability * impact;
                cells.add(new HeatmapCell(
                        probability,
                        impact,
                        score,
                        Severity.of(score),
                        byCell.getOrDefault(cell(probability, impact), List.of())));
            }
        }
        return cells;
    }

    @Transactional(readOnly = true)
    public Risk get(UUID riskId) {
        return find(riskId);
    }

    @Transactional
    public Risk create(UUID projectId, NewRisk command) {
        ProjectRef project = projects.participating(projectId).project();
        support.requireMember(command.ownerId(), "ownerId");
        GovernanceSupport.Numbered numbered = support.next(project, GovernanceSequence.Kind.R);
        Risk risk = Risk.raise(
                support.organizationId(),
                projectId,
                numbered.key(),
                numbered.number(),
                command.title(),
                command.kind(),
                command.category(),
                command.probability(),
                command.impact(),
                support.me(),
                clock.instant());
        risk.describe(command.description());
        risk.expectIn(command.proximity());
        risk.assignOwner(command.ownerId());
        risk.planResponse(command.responseStrategy(), command.responsePlan());
        risk.watchFor(command.triggerConditions());
        risk.reviewOn(command.reviewDate());
        Risk saved = risks.saveAndFlush(risk);
        assessments.save(RiskAssessment.of(saved, "Initial assessment", support.me(), clock.instant()));
        events.publishEvent(new RiskChanged(projectId));
        return saved;
    }

    @Transactional
    public Risk update(UUID riskId, long expectedVersion, RiskChanges changes) {
        Risk risk = find(riskId);
        support.requireManagerOrOwner(risk.getProjectId(), risk.getOwnerId());
        OptimisticLock.check(expectedVersion, risk.getVersion());
        risk.ensureOpen();
        if (changes.title() != null) {
            risk.retitle(changes.title());
        }
        if (changes.description() != null) {
            risk.describe(changes.description());
        }
        if (changes.category() != null) {
            risk.categorize(changes.category());
        }
        if (changes.proximity() != null) {
            risk.expectIn(changes.proximity());
        }
        if (changes.ownerId() != null) {
            support.requireMember(changes.ownerId(), "ownerId");
            risk.assignOwner(changes.ownerId());
        }
        risk.planResponse(changes.responseStrategy(), changes.responsePlan());
        if (changes.triggerConditions() != null) {
            risk.watchFor(changes.triggerConditions());
        }
        if (changes.reviewDate() != null) {
            risk.reviewOn(changes.reviewDate());
        }
        if (changes.status() != null) {
            risk.moveTo(changes.status());
        }
        Risk saved = risks.saveAndFlush(risk);
        events.publishEvent(new RiskChanged(risk.getProjectId()));
        return saved;
    }

    @Transactional(readOnly = true)
    public List<RiskAssessment> assessments(UUID riskId) {
        find(riskId);
        return assessments.findByRiskIdOrderByAssessedAtAsc(riskId);
    }

    @Transactional
    public RiskAssessment assess(UUID riskId, Assessment assessment) {
        Risk risk = find(riskId);
        support.requireManagerOrOwner(risk.getProjectId(), risk.getOwnerId());
        risk.assess(
                assessment.probability(),
                assessment.impact(),
                assessment.residualProbability(),
                assessment.residualImpact());
        risks.saveAndFlush(risk);
        RiskAssessment saved =
                assessments.save(RiskAssessment.of(risk, assessment.note(), support.me(), clock.instant()));
        events.publishEvent(new RiskChanged(risk.getProjectId()));
        return saved;
    }

    @Transactional
    public Risk close(UUID riskId, String note) {
        Risk risk = find(riskId);
        support.requireManagerOrOwner(risk.getProjectId(), risk.getOwnerId());
        risk.close(RiskClosure.EXPIRED, note);
        Risk saved = risks.saveAndFlush(risk);
        events.publishEvent(new RiskChanged(risk.getProjectId()));
        return saved;
    }

    /** The risk happened: one transaction opens the issue that tracks it and closes the risk as materialized. */
    @Transactional
    public Issue materialize(UUID riskId, NewIssueFromRisk command) {
        Risk risk = find(riskId);
        support.requireManagerOrOwner(risk.getProjectId(), risk.getOwnerId());
        risk.ensureOpen();
        ProjectRef project = projects.readable(risk.getProjectId());
        UUID owner = command.ownerId() != null ? command.ownerId() : risk.getOwnerId();
        support.requireMember(owner, "ownerId");
        GovernanceSupport.Numbered numbered = support.next(project, GovernanceSequence.Kind.I);
        Issue issue = Issue.raise(
                support.organizationId(),
                project.id(),
                numbered.key(),
                numbered.number(),
                command.title() != null ? command.title() : risk.getTitle(),
                IssueType.OTHER,
                command.priority() != null ? command.priority() : priorityOf(risk.severity()),
                support.me(),
                risk.getId(),
                clock.instant());
        issue.describe(risk.getDescription());
        issue.assignOwner(owner);
        issue.dueOn(command.dueDate());
        Issue saved = issues.saveAndFlush(issue);
        risk.materializedAs(saved.getId(), "Materialized as " + saved.getKey());
        risks.saveAndFlush(risk);
        events.publishEvent(new RiskChanged(risk.getProjectId()));
        return saved;
    }

    private Risk find(UUID riskId) {
        Risk risk = risks.findById(riskId).orElseThrow(() -> NotFoundException.of("Risk", riskId));
        projects.readable(risk.getProjectId());
        return risk;
    }

    private static int cell(int probability, int impact) {
        return probability * 10 + impact;
    }

    private static IssuePriority priorityOf(Severity severity) {
        return switch (severity) {
            case CRITICAL -> IssuePriority.CRITICAL;
            case HIGH -> IssuePriority.HIGH;
            case MEDIUM -> IssuePriority.MEDIUM;
            case LOW -> IssuePriority.LOW;
        };
    }
}
