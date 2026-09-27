package com.kora.resourcing.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** A person's week across projects: what the timesheet screen shows and the rules that span projects. */
public record TimesheetWeek(IsoWeek week, List<Timesheet> sheets) {

    public static final BigDecimal HOURS_IN_A_DAY = BigDecimal.valueOf(24);

    public TimesheetWeek {
        sheets = List.copyOf(sheets);
    }

    /**
     * APPROVED when every project approved it, REJECTED when any rejected it, SUBMITTED when all are submitted or
     * approved, DRAFT otherwise (including a week with nothing logged yet).
     */
    public TimesheetStatus status() {
        List<TimesheetStatus> statuses = sheets.stream()
                .filter(sheet -> !sheet.isEmpty() || sheet.getStatus() != TimesheetStatus.DRAFT)
                .map(Timesheet::getStatus)
                .toList();
        if (statuses.isEmpty()) {
            return TimesheetStatus.DRAFT;
        }
        if (statuses.contains(TimesheetStatus.REJECTED)) {
            return TimesheetStatus.REJECTED;
        }
        if (statuses.stream().allMatch(status -> status == TimesheetStatus.APPROVED)) {
            return TimesheetStatus.APPROVED;
        }
        if (statuses.stream().allMatch(status -> !status.isEditable())) {
            return TimesheetStatus.SUBMITTED;
        }
        return TimesheetStatus.DRAFT;
    }

    public boolean editable() {
        return sheets.isEmpty()
                || sheets.stream().anyMatch(sheet -> sheet.getStatus().isEditable());
    }

    public List<TimeEntry> entries() {
        return sheets.stream().flatMap(sheet -> sheet.getEntries().stream()).toList();
    }

    public Map<LocalDate, BigDecimal> dailyTotals() {
        return totals(entries().stream().map(TimeEntry::line).toList(), week);
    }

    public BigDecimal totalHours() {
        return entries().stream().map(TimeEntry::getHours).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * @throws InvalidInputException on {@code entries} when a day adds up to more than 24 hours over all projects
     */
    public static void checkDailyTotals(Collection<TimeEntry.Line> lines, IsoWeek week) {
        totals(lines, week).forEach((day, hours) -> {
            if (hours.compareTo(HOURS_IN_A_DAY) > 0) {
                throw new InvalidInputException(FieldViolation.of(
                        "entries",
                        PlatformErrorCodes.Field.RANGE,
                        day.getDayOfWeek() + " " + day + " totals "
                                + hours.stripTrailingZeros().toPlainString() + " h; a day holds at most 24"));
            }
        });
    }

    private static Map<LocalDate, BigDecimal> totals(Collection<TimeEntry.Line> lines, IsoWeek week) {
        Map<LocalDate, BigDecimal> totals = new TreeMap<>();
        for (int i = 0; i < 7; i++) {
            totals.put(week.monday().plusDays(i), BigDecimal.ZERO);
        }
        lines.forEach(line -> totals.merge(line.date(), line.hours(), BigDecimal::add));
        return totals;
    }
}
