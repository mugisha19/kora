package com.kora.reporting.application;

import com.kora.platform.error.NotFoundException;
import com.kora.portfolio.Health;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectQueries;
import com.kora.reporting.application.DashboardService.Summary;
import com.kora.reporting.application.SnapshotRepository.SnapshotFilter;
import com.kora.reporting.domain.ProjectSnapshot;
import com.kora.reports.Cell;
import com.kora.reports.ReportContent;
import com.kora.reports.ReportLabels;
import com.kora.reports.ReportParams;
import com.kora.reports.ReportSection;
import com.kora.reports.ReportSection.Fact;
import com.kora.reports.ReportSource;
import com.kora.reports.ReportTable;
import com.kora.reports.ReportType;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The portfolio summary (feature 21): the dashboard's figures and its project list, for one portfolio or every
 * project the member can see.
 */
@Component
class PortfolioSummaryReport implements ReportSource {

    private final DashboardService dashboard;
    private final SnapshotRepository snapshots;
    private final ProjectAccess projects;
    private final ProjectQueries projectQueries;

    PortfolioSummaryReport(
            DashboardService dashboard,
            SnapshotRepository snapshots,
            ProjectAccess projects,
            ProjectQueries projectQueries) {
        this.dashboard = dashboard;
        this.snapshots = snapshots;
        this.projects = projects;
        this.projectQueries = projectQueries;
    }

    @Override
    public ReportType type() {
        return ReportType.PORTFOLIO_SUMMARY;
    }

    @Override
    public void check(ReportParams params) {
        subject(params, null);
    }

    @Override
    public ReportContent build(ReportParams params, ReportLabels labels) {
        Summary summary = dashboard.summary(params.portfolioId());
        List<Fact> figures = new ArrayList<>(
                List.of(new Fact(labels.text("report.portfolio.projects"), Cell.quantity(summary.projectCount()))));
        for (Health health : Health.values()) {
            figures.add(new Fact(
                    labels.value(health), Cell.quantity(summary.byHealth().getOrDefault(health, 0))));
        }
        figures.addAll(List.of(
                new Fact(labels.text("report.portfolio.late"), Cell.quantity(summary.lateProjects())),
                new Fact(labels.text("report.column.budget"), Cell.amount(summary.totalBudget())),
                new Fact(labels.text("report.column.plannedCost"), Cell.amount(summary.totalPlannedCost())),
                new Fact(labels.text("report.evm.ev"), Cell.amount(summary.totalEarnedValue())),
                new Fact(labels.text("report.evm.ac"), Cell.amount(summary.totalActualCost())),
                new Fact(labels.text("report.evm.spi"), Cell.quantity(summary.portfolioSpi())),
                new Fact(labels.text("report.evm.cpi"), Cell.quantity(summary.portfolioCpi())),
                new Fact(labels.text("report.status.openCriticalRisks"), Cell.quantity(summary.openCriticalRisks())),
                new Fact(
                        labels.text("report.status.pendingChangeRequests"),
                        Cell.quantity(summary.pendingChangeRequests()))));
        List<ProjectSnapshot> rows =
                snapshots.search(new SnapshotFilter(projects.visibility(), params.portfolioId(), null)).stream()
                        .sorted(Comparator.comparing(ProjectSnapshot::getCode))
                        .toList();
        ReportTable table = new ReportTable(
                List.of(
                        labels.text("report.column.code"),
                        labels.text("report.column.name"),
                        labels.text("report.column.manager"),
                        labels.text("report.column.status"),
                        labels.text("report.column.health"),
                        labels.text("report.column.percentComplete"),
                        labels.text("report.column.budget"),
                        labels.text("report.evm.ac"),
                        labels.text("report.evm.spi"),
                        labels.text("report.evm.cpi"),
                        labels.text("report.column.targetEnd"),
                        labels.text("report.column.late")),
                rows.stream()
                        .map(row -> List.of(
                                Cell.text(row.getCode()),
                                Cell.text(row.getName()),
                                Cell.text(labels.person(row.getManagerId())),
                                Cell.text(labels.value("ProjectStatus", row.getStatus())),
                                Cell.text(labels.value(row.getHealth())),
                                Cell.percent(row.getPercentComplete()),
                                Cell.amount(row.getBudget()),
                                Cell.amount(row.getActualCost()),
                                Cell.quantity(row.getSpi()),
                                Cell.quantity(row.getCpi()),
                                Cell.day(row.getTargetEndDate()),
                                Cell.text(labels.yesNo(row.isLate()))))
                        .toList());
        return new ReportContent(
                labels.text("report.title.PORTFOLIO_SUMMARY"),
                subject(params, labels),
                List.of(
                        ReportSection.facts(labels.text("report.portfolio.figures"), figures),
                        ReportSection.table(
                                labels.text("report.portfolio.projectList"),
                                table,
                                labels.text("report.portfolio.noProjects"))));
    }

    /** The portfolio's name, or "every project" in the reader's language; 404 for an unknown portfolio. */
    private String subject(ReportParams params, ReportLabels labels) {
        if (params.portfolioId() == null) {
            return labels == null ? "" : labels.text("report.scope.allProjects");
        }
        return projectQueries
                .portfolioName(params.portfolioId())
                .orElseThrow(() -> NotFoundException.of("portfolio", params.portfolioId()));
    }
}
