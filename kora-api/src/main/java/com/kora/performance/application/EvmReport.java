package com.kora.performance.application;

import com.kora.performance.application.EvmService.Point;
import com.kora.performance.application.EvmService.Report;
import com.kora.performance.application.EvmService.Series;
import com.kora.performance.domain.EarnedValueAnalysis;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import com.kora.reports.Cell;
import com.kora.reports.ReportContent;
import com.kora.reports.ReportLabels;
import com.kora.reports.ReportParams;
import com.kora.reports.ReportSection;
import com.kora.reports.ReportSection.Fact;
import com.kora.reports.ReportSource;
import com.kora.reports.ReportTable;
import com.kora.reports.ReportType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The earned value report (feature 21 over feature 17): today's metrics with the methods behind them, and the weekly
 * S-curve figures.
 */
@Component
class EvmReport implements ReportSource {

    private final EvmService evm;
    private final ProjectAccess projects;

    EvmReport(EvmService evm, ProjectAccess projects) {
        this.evm = evm;
        this.projects = projects;
    }

    @Override
    public ReportType type() {
        return ReportType.EVM;
    }

    @Override
    public void check(ReportParams params) {
        projects.readable(params.requireProject());
    }

    @Override
    public ReportContent build(ReportParams params, ReportLabels labels) {
        ProjectRef project = projects.readable(params.requireProject());
        Report report = evm.report(project.id());
        EarnedValueAnalysis metrics = report.analysis();
        List<ReportSection> sections = new ArrayList<>();
        sections.add(ReportSection.facts(
                labels.text("report.evm.method"),
                List.of(
                        new Fact(labels.text("report.evm.asOf"), Cell.day(report.asOf())),
                        new Fact(
                                labels.text("report.evm.percentCompleteMethod"),
                                Cell.text(labels.value(report.settings().getPercentCompleteMethod()))),
                        new Fact(
                                labels.text("report.evm.eacMethod"),
                                Cell.text(labels.value(report.settings().getEacMethod()))),
                        new Fact(labels.text("report.evm.unratedHours"), Cell.quantity(report.unratedHours())))));
        sections.add(ReportSection.facts(
                labels.text("report.evm.metrics"),
                List.of(
                        new Fact(labels.text("report.evm.bac"), Cell.amount(metrics.bac())),
                        new Fact(labels.text("report.evm.pv"), Cell.amount(metrics.pv())),
                        new Fact(labels.text("report.evm.ev"), Cell.amount(metrics.ev())),
                        new Fact(labels.text("report.evm.ac"), Cell.amount(metrics.ac())),
                        new Fact(labels.text("report.evm.sv"), Cell.amount(metrics.sv())),
                        new Fact(labels.text("report.evm.cv"), Cell.amount(metrics.cv())),
                        new Fact(labels.text("report.evm.spi"), Cell.quantity(metrics.spi())),
                        new Fact(labels.text("report.evm.cpi"), Cell.quantity(metrics.cpi())),
                        new Fact(labels.text("report.evm.eac"), Cell.amount(metrics.eac())),
                        new Fact(labels.text("report.evm.etc"), Cell.amount(metrics.etc())),
                        new Fact(labels.text("report.evm.vac"), Cell.amount(metrics.vac())),
                        new Fact(labels.text("report.evm.tcpi"), Cell.quantity(metrics.tcpi())))));
        if (!metrics.unavailable().isEmpty()) {
            sections.add(ReportSection.table(
                    labels.text("report.evm.unavailable"),
                    new ReportTable(
                            List.of(labels.text("report.column.metric"), labels.text("report.column.reason")),
                            metrics.unavailable().stream()
                                    .map(missing -> List.of(Cell.text(missing.metric()), Cell.text(missing.reason())))
                                    .toList()),
                    null));
        }
        sections.add(ReportSection.table(labels.text("report.evm.weekly"), weekly(project, labels), null));
        return new ReportContent(labels.text("report.title.EVM"), project.code() + " · " + project.name(), sections);
    }

    /** From the start to the target end, the last two years at most (the series' limit). */
    private ReportTable weekly(ProjectRef project, ReportLabels labels) {
        LocalDate to = project.targetEndDate();
        LocalDate from = project.startDate();
        if (from.plusWeeks(EvmService.MAX_WEEKS - 1).isBefore(to)) {
            from = to.minusWeeks(EvmService.MAX_WEEKS - 1);
        }
        Series series = evm.series(project.id(), from, to);
        List<List<Cell>> rows = new ArrayList<>();
        for (Point point : series.points()) {
            rows.add(List.of(
                    Cell.day(point.weekEnding()),
                    Cell.amount(point.pv()),
                    Cell.amount(point.ev()),
                    Cell.amount(point.ac()),
                    Cell.quantity(
                            point.ev() == null
                                    ? null
                                    : ratio(point.ev().amount(), point.pv().amount())),
                    Cell.quantity(
                            point.ev() == null || point.ac() == null
                                    ? null
                                    : ratio(point.ev().amount(), point.ac().amount()))));
        }
        return new ReportTable(
                List.of(
                        labels.text("report.column.weekEnding"),
                        labels.text("report.evm.pv"),
                        labels.text("report.evm.ev"),
                        labels.text("report.evm.ac"),
                        labels.text("report.evm.spi"),
                        labels.text("report.evm.cpi")),
                rows);
    }

    /** Omitted where it would divide by zero, as everywhere in EVM. */
    private static BigDecimal ratio(BigDecimal numerator, BigDecimal denominator) {
        return denominator.signum() == 0 ? null : numerator.divide(denominator, 2, RoundingMode.HALF_EVEN);
    }
}
