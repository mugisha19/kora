package com.kora.governance.application;

import com.kora.governance.domain.Risk;
import com.kora.platform.error.NotFoundException;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectRef;
import com.kora.portfolio.ProjectVisibility;
import com.kora.reports.Cell;
import com.kora.reports.ReportContent;
import com.kora.reports.ReportLabels;
import com.kora.reports.ReportParams;
import com.kora.reports.ReportSection;
import com.kora.reports.ReportSource;
import com.kora.reports.ReportTable;
import com.kora.reports.ReportType;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The risk register (feature 21 over feature 11): every risk of one project, or the open risks of a portfolio or of
 * every project the member can see, highest score first.
 */
@Component
class RiskRegisterReport implements ReportSource {

    private final RiskRepository risks;
    private final ProjectAccess projects;
    private final ProjectQueries projectQueries;

    RiskRegisterReport(RiskRepository risks, ProjectAccess projects, ProjectQueries projectQueries) {
        this.risks = risks;
        this.projects = projects;
        this.projectQueries = projectQueries;
    }

    @Override
    public ReportType type() {
        return ReportType.RISK_REGISTER;
    }

    @Override
    public void check(ReportParams params) {
        if (params.projectId() != null) {
            projects.readable(params.projectId());
        } else if (params.portfolioId() != null) {
            portfolioName(params.portfolioId());
        }
    }

    @Override
    public ReportContent build(ReportParams params, ReportLabels labels) {
        String subject;
        Set<UUID> scope;
        boolean openOnly;
        if (params.projectId() != null) {
            ProjectRef project = projects.readable(params.projectId());
            subject = project.code() + " · " + project.name();
            scope = Set.of(project.id());
            openOnly = false;
        } else {
            ProjectVisibility visibility = projects.visibility();
            if (params.portfolioId() != null) {
                subject = portfolioName(params.portfolioId());
                scope = new HashSet<>(projectQueries.projectIdsOfPortfolio(params.portfolioId()));
                scope.removeIf(id -> !visibility.includes(id));
            } else {
                subject = labels.text("report.scope.allProjects");
                scope = visibility.all() ? null : visibility.projectIds();
            }
            openOnly = true;
        }
        List<Risk> found = scope != null && scope.isEmpty()
                ? List.of()
                : risks.search(new RiskSearch(scope, null, null, null, null, null, null, openOnly)).stream()
                        .sorted(Comparator.comparingInt(Risk::score).reversed().thenComparing(Risk::getKey))
                        .toList();
        Map<UUID, String> codes = new HashMap<>();
        ReportTable table = new ReportTable(
                List.of(
                        labels.text("report.column.project"),
                        labels.text("report.column.key"),
                        labels.text("report.column.title"),
                        labels.text("report.column.kind"),
                        labels.text("report.column.category"),
                        labels.text("report.column.probability"),
                        labels.text("report.column.impact"),
                        labels.text("report.column.score"),
                        labels.text("report.column.severity"),
                        labels.text("report.column.status"),
                        labels.text("report.column.owner"),
                        labels.text("report.column.responseStrategy"),
                        labels.text("report.column.reviewDate")),
                found.stream()
                        .map(risk -> List.of(
                                Cell.text(codes.computeIfAbsent(
                                        risk.getProjectId(),
                                        id -> projects.readable(id).code())),
                                Cell.text(risk.getKey()),
                                Cell.text(risk.getTitle()),
                                Cell.text(labels.value(risk.getKind())),
                                Cell.text(labels.value(risk.getCategory())),
                                Cell.quantity(risk.getProbability()),
                                Cell.quantity(risk.getImpact()),
                                Cell.quantity(risk.score()),
                                Cell.text(labels.value(risk.severity())),
                                Cell.text(labels.value(risk.getStatus())),
                                Cell.text(labels.person(risk.getOwnerId())),
                                Cell.text(labels.value(risk.getResponseStrategy())),
                                Cell.day(risk.getReviewDate())))
                        .toList());
        return new ReportContent(
                labels.text("report.title.RISK_REGISTER"),
                subject,
                List.of(ReportSection.table(
                        labels.text("report.risks.register"), table, labels.text("report.status.noRisks"))));
    }

    private String portfolioName(UUID portfolioId) {
        return projectQueries
                .portfolioName(portfolioId)
                .orElseThrow(() -> NotFoundException.of("portfolio", portfolioId));
    }
}
