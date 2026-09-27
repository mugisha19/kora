package com.kora.reporting.application;

import com.kora.governance.GovernanceQueries;
import com.kora.governance.GovernanceQueries.IssueLine;
import com.kora.governance.GovernanceQueries.RiskLine;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectRef;
import com.kora.portfolio.ProjectSnapshotSource;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The project status report for sponsors and steering committees (feature 21): where the project stands, what it
 * costs, and what needs attention, from the same read model as the dashboard.
 */
@Component
class ProjectStatusReport implements ReportSource {

    private static final int TOP = 10;

    private final ProjectAccess projects;
    private final ProjectQueries projectQueries;
    private final SnapshotRepository snapshots;
    private final GovernanceQueries governance;

    ProjectStatusReport(
            ProjectAccess projects,
            ProjectQueries projectQueries,
            SnapshotRepository snapshots,
            GovernanceQueries governance) {
        this.projects = projects;
        this.projectQueries = projectQueries;
        this.snapshots = snapshots;
        this.governance = governance;
    }

    @Override
    public ReportType type() {
        return ReportType.PROJECT_STATUS;
    }

    @Override
    public void check(ReportParams params) {
        projects.readable(params.requireProject());
    }

    @Override
    public ReportContent build(ReportParams params, ReportLabels labels) {
        UUID projectId = params.requireProject();
        ProjectRef project = projects.readable(projectId);
        Optional<ProjectSnapshot> snapshot = snapshots.findById(projectId);
        List<ReportSection> sections = new ArrayList<>();
        sections.add(ReportSection.facts(labels.text("report.status.overview"), overview(project, snapshot, labels)));
        snapshot.ifPresent(row -> {
            sections.add(ReportSection.facts(labels.text("report.status.progress"), progress(row, labels)));
            sections.add(ReportSection.facts(
                    labels.text("report.status.governance"),
                    List.of(
                            new Fact(
                                    labels.text("report.status.openCriticalRisks"),
                                    Cell.quantity(row.getOpenCriticalRisks())),
                            new Fact(
                                    labels.text("report.status.pendingChangeRequests"),
                                    Cell.quantity(row.getPendingChangeRequests())))));
        });
        List<ProjectSnapshotSource.Milestone> milestones = projectQueries
                .snapshotSource(projectId)
                .map(ProjectSnapshotSource::charterMilestones)
                .orElse(List.of());
        sections.add(ReportSection.table(
                labels.text("report.status.milestones"),
                new ReportTable(
                        List.of(labels.text("report.column.milestone"), labels.text("report.column.targetDate")),
                        milestones.stream()
                                .map(milestone ->
                                        List.of(Cell.text(milestone.name()), Cell.day(milestone.targetDate())))
                                .toList()),
                labels.text("report.status.noMilestones")));
        sections.add(ReportSection.table(
                labels.text("report.status.topRisks"),
                risks(governance.topOpenRisks(projectId, TOP), labels),
                labels.text("report.status.noRisks")));
        sections.add(ReportSection.table(
                labels.text("report.status.openIssues"),
                issues(governance.openIssues(projectId, TOP), labels),
                labels.text("report.status.noIssues")));
        return new ReportContent(
                labels.text("report.title.PROJECT_STATUS"), project.code() + " · " + project.name(), sections);
    }

    private static List<Fact> overview(ProjectRef project, Optional<ProjectSnapshot> snapshot, ReportLabels labels) {
        List<Fact> facts = new ArrayList<>(List.of(
                new Fact(labels.text("report.column.project"), Cell.text(project.code() + " · " + project.name())),
                new Fact(labels.text("report.column.manager"), Cell.text(labels.person(project.managerId()))),
                new Fact(
                        labels.text("report.column.methodology"),
                        Cell.text(labels.value("Methodology", project.methodology()))),
                new Fact(
                        labels.text("report.column.status"),
                        Cell.text(labels.value("ProjectStatus", project.status()))),
                new Fact(labels.text("report.column.start"), Cell.day(project.startDate())),
                new Fact(labels.text("report.column.targetEnd"), Cell.day(project.targetEndDate()))));
        snapshot.ifPresent(row -> {
            String health = labels.value(row.getHealth());
            facts.add(new Fact(
                    labels.text("report.column.health"),
                    Cell.text(row.getHealthReason() == null ? health : health + " · " + row.getHealthReason())));
            if (row.getNextMilestoneName() != null) {
                facts.add(new Fact(
                        labels.text("report.status.nextMilestone"),
                        Cell.text(row.getNextMilestoneName() + " · " + row.getNextMilestoneDate())));
            }
        });
        return facts;
    }

    private static List<Fact> progress(ProjectSnapshot row, ReportLabels labels) {
        return List.of(
                new Fact(labels.text("report.column.percentComplete"), Cell.percent(row.getPercentComplete())),
                new Fact(labels.text("report.column.budget"), Cell.amount(row.getBudget())),
                new Fact(labels.text("report.column.plannedCost"), Cell.amount(row.getPlannedCost())),
                new Fact(labels.text("report.evm.pv"), Cell.amount(row.getPlannedValue())),
                new Fact(labels.text("report.evm.ev"), Cell.amount(row.getEvmEarnedValue())),
                new Fact(labels.text("report.evm.ac"), Cell.amount(row.getActualCost())),
                new Fact(labels.text("report.evm.spi"), Cell.quantity(row.getSpi())),
                new Fact(labels.text("report.evm.cpi"), Cell.quantity(row.getCpi())));
    }

    private static ReportTable risks(List<RiskLine> risks, ReportLabels labels) {
        return new ReportTable(
                List.of(
                        labels.text("report.column.key"),
                        labels.text("report.column.title"),
                        labels.text("report.column.score"),
                        labels.text("report.column.severity"),
                        labels.text("report.column.status"),
                        labels.text("report.column.owner"),
                        labels.text("report.column.reviewDate")),
                risks.stream()
                        .map(risk -> List.of(
                                Cell.text(risk.key()),
                                Cell.text(risk.title()),
                                Cell.quantity(risk.score()),
                                Cell.text(labels.value("Severity", risk.severity())),
                                Cell.text(labels.value("RiskStatus", risk.status())),
                                Cell.text(labels.person(risk.ownerId())),
                                Cell.day(risk.reviewDate())))
                        .toList());
    }

    private static ReportTable issues(List<IssueLine> issues, ReportLabels labels) {
        return new ReportTable(
                List.of(
                        labels.text("report.column.key"),
                        labels.text("report.column.title"),
                        labels.text("report.column.priority"),
                        labels.text("report.column.status"),
                        labels.text("report.column.owner"),
                        labels.text("report.column.dueDate")),
                issues.stream()
                        .map(issue -> List.of(
                                Cell.text(issue.key()),
                                Cell.text(issue.title()),
                                Cell.text(labels.value("IssuePriority", issue.priority())),
                                Cell.text(labels.value("IssueStatus", issue.status())),
                                Cell.text(labels.person(issue.ownerId())),
                                Cell.day(issue.dueDate())))
                        .toList());
    }
}
