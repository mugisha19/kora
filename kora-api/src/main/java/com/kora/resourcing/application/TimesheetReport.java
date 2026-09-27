package com.kora.resourcing.application;

import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
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
import com.kora.resourcing.domain.IsoWeek;
import com.kora.resourcing.domain.TimeEntry;
import com.kora.resourcing.domain.Timesheet;
import com.kora.resourcing.domain.TimesheetStatus;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The timesheet summary for a project's managers (feature 21 over feature 15): hours per person and week with their
 * status, and every entry, for a range of up to 26 weeks.
 */
@Component
class TimesheetReport implements ReportSource {

    static final int MAX_WEEKS = 26;

    private final TimesheetRepository timesheets;
    private final ProjectAccess projects;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    TimesheetReport(
            TimesheetRepository timesheets, ProjectAccess projects, OrganizationTimeZone timeZone, Clock clock) {
        this.timesheets = timesheets;
        this.projects = projects;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    @Override
    public ReportType type() {
        return ReportType.TIMESHEETS;
    }

    /** The same managers who review the project's timesheets on screen. */
    @Override
    public void check(ReportParams params) {
        projects.manageable(params.requireProject());
        range(params);
    }

    @Override
    public ReportContent build(ReportParams params, ReportLabels labels) {
        ProjectRef project = projects.manageable(params.requireProject());
        LocalDate[] range = range(params);
        LocalDate from = range[0];
        LocalDate to = range[1];
        List<Timesheet> sheets = timesheets.findByProjectIdAndWeekStartBetweenOrderByWeekStartAscUserIdAsc(
                project.id(), from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)), to);
        List<List<Cell>> weeks = new ArrayList<>();
        List<List<Cell>> entries = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal approved = BigDecimal.ZERO;
        Set<UUID> people = new HashSet<>();
        for (Timesheet sheet : sheets) {
            BigDecimal hours = BigDecimal.ZERO;
            for (TimeEntry entry : sheet.getEntries()) {
                if (entry.getDate().isBefore(from) || entry.getDate().isAfter(to)) {
                    continue;
                }
                hours = hours.add(entry.getHours());
                entries.add(List.of(
                        Cell.day(entry.getDate()),
                        Cell.text(labels.person(sheet.getUserId())),
                        Cell.text(
                                entry.getTaskKey() == null ? null : entry.getTaskKey() + " · " + entry.getTaskTitle()),
                        Cell.quantity(entry.getHours()),
                        Cell.text(labels.yesNo(entry.isBillable())),
                        Cell.text(labels.value(sheet.getStatus())),
                        Cell.text(entry.getNote())));
            }
            if (hours.signum() == 0) {
                continue;
            }
            people.add(sheet.getUserId());
            total = total.add(hours);
            if (sheet.getStatus() == TimesheetStatus.APPROVED) {
                approved = approved.add(hours);
            }
            weeks.add(List.of(
                    Cell.text(new IsoWeek(sheet.getWeekStart()).toString()),
                    Cell.text(labels.person(sheet.getUserId())),
                    Cell.text(labels.value(sheet.getStatus())),
                    Cell.quantity(hours)));
        }
        return new ReportContent(
                labels.text("report.title.TIMESHEETS"),
                project.code() + " · " + project.name(),
                List.of(
                        ReportSection.facts(
                                labels.text("report.timesheets.totals"),
                                List.of(
                                        new Fact(labels.text("report.timesheets.period"), Cell.text(from + " – " + to)),
                                        new Fact(labels.text("report.timesheets.people"), Cell.quantity(people.size())),
                                        new Fact(labels.text("report.timesheets.hours"), Cell.quantity(total)),
                                        new Fact(
                                                labels.text("report.timesheets.approvedHours"),
                                                Cell.quantity(approved)))),
                        ReportSection.table(
                                labels.text("report.timesheets.byWeek"),
                                new ReportTable(
                                        List.of(
                                                labels.text("report.column.week"),
                                                labels.text("report.column.person"),
                                                labels.text("report.column.status"),
                                                labels.text("report.column.hours")),
                                        weeks),
                                labels.text("report.timesheets.none")),
                        ReportSection.table(
                                labels.text("report.timesheets.entries"),
                                new ReportTable(
                                        List.of(
                                                labels.text("report.column.date"),
                                                labels.text("report.column.person"),
                                                labels.text("report.column.task"),
                                                labels.text("report.column.hours"),
                                                labels.text("report.column.billable"),
                                                labels.text("report.column.status"),
                                                labels.text("report.column.note")),
                                        entries),
                                labels.text("report.timesheets.none"))));
    }

    /** Four weeks up to today by default; at most 26 weeks, first day first. */
    private LocalDate[] range(ReportParams params) {
        LocalDate today = LocalDate.now(clock.withZone(timeZone.zone()));
        LocalDate to = params.to() != null ? params.to() : today;
        LocalDate from =
                params.from() != null ? params.from() : to.minusWeeks(4).plusDays(1);
        if (from.isAfter(to)) {
            throw new InvalidInputException(
                    FieldViolation.of("params.from", PlatformErrorCodes.Field.RANGE, "must not be after params.to"));
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_WEEKS * 7L) {
            throw new InvalidInputException(
                    FieldViolation.of("params.to", PlatformErrorCodes.Field.RANGE, "at most " + MAX_WEEKS + " weeks"));
        }
        return new LocalDate[] {from, to};
    }
}
