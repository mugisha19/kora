package com.kora.resourcing.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.ProblemException;
import com.kora.platform.money.Money;
import com.kora.schedule.domain.PublicHolidays;
import com.kora.schedule.domain.WorkingCalendar.Holiday;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Features 15–16: ISO weeks, timesheet rules, costing by date, weekly capacity and public holidays. */
class ResourcingTest {

    private static final Instant NOW = Instant.parse("2026-10-02T15:00:00Z");
    private static final IsoWeek WEEK_40 = IsoWeek.parse("2026-W40", "week");
    private static final UUID ORG = UUID.randomUUID();
    private static final UUID PERSON = UUID.randomUUID();
    private static final UUID TASK = UUID.randomUUID();

    @Test
    void isoWeeksParseAndPrint() {
        assertThat(WEEK_40.monday()).isEqualTo(LocalDate.of(2026, 9, 28));
        assertThat(WEEK_40.sunday()).isEqualTo(LocalDate.of(2026, 10, 4));
        assertThat(WEEK_40).hasToString("2026-W40");
        assertThat(IsoWeek.containing(LocalDate.of(2027, 1, 1))).hasToString("2026-W53");
        assertThat(IsoWeek.parse("2026-W53", "week").monday()).isEqualTo(LocalDate.of(2026, 12, 28));
        assertThatThrownBy(() -> IsoWeek.parse("2025-W53", "week")).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> IsoWeek.parse("2026-40", "week")).isInstanceOf(InvalidInputException.class);
    }

    @Test
    void aDayHoldsAtMost24HoursAcrossProjects() {
        List<TimeEntry.Line> lines =
                List.of(line(WEEK_40.monday(), "16"), line(WEEK_40.monday(), "8.25"), line(WEEK_40.sunday(), "24"));

        assertThatThrownBy(() -> TimesheetWeek.checkDailyTotals(lines, WEEK_40))
                .isInstanceOfSatisfying(
                        InvalidInputException.class,
                        error -> assertThat(error.violations().getFirst().message())
                                .isEqualTo("MONDAY 2026-09-28 totals 24.25 h; a day holds at most 24"));
    }

    @Test
    void submittedTimeIsLockedAndOnlySomeoneElseDecidesIt() {
        Timesheet sheet = Timesheet.open(ORG, PERSON, UUID.randomUUID(), WEEK_40);
        sheet.replaceEntries(List.of(entry(line(WEEK_40.monday(), "8"))));
        sheet.submit(NOW);

        assertThatThrownBy(() -> sheet.replaceEntries(List.of()))
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("timesheets.locked");
        assertThat(sheet.hasLines(List.of(line(WEEK_40.monday(), "8.00")))).isTrue();
        assertThat(sheet.hasLines(List.of(line(WEEK_40.monday(), "7.5")))).isFalse();
        assertThatThrownBy(() -> sheet.approve(PERSON, NOW))
                .isInstanceOf(ConflictException.class)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("timesheets.self_approval");

        sheet.reject(UUID.randomUUID(), "Tuesday is missing", NOW);
        assertThat(sheet.getStatus().isEditable()).isTrue();
        assertThatThrownBy(() -> sheet.approve(UUID.randomUUID(), NOW))
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("timesheets.not_submitted");
    }

    @Test
    void aWeeksStatusSummarizesItsProjects() {
        Timesheet first = Timesheet.open(ORG, PERSON, UUID.randomUUID(), WEEK_40);
        Timesheet second = Timesheet.open(ORG, PERSON, UUID.randomUUID(), WEEK_40);
        first.replaceEntries(List.of(entry(line(WEEK_40.monday(), "4"))));
        second.replaceEntries(List.of(entry(line(WEEK_40.monday(), "4"))));
        TimesheetWeek week = new TimesheetWeek(WEEK_40, List.of(first, second));
        assertThat(week.status()).isEqualTo(TimesheetStatus.DRAFT);

        first.submit(NOW);
        assertThat(week.status()).isEqualTo(TimesheetStatus.DRAFT);
        second.submit(NOW);
        assertThat(week.status()).isEqualTo(TimesheetStatus.SUBMITTED);
        assertThat(week.editable()).isFalse();
        first.approve(UUID.randomUUID(), NOW);
        second.reject(UUID.randomUUID(), "Wrong task", NOW);
        assertThat(week.status()).isEqualTo(TimesheetStatus.REJECTED);
        assertThat(week.totalHours()).isEqualByComparingTo("8");
    }

    @Test
    void hoursAreCostedAtTheRateValidOnTheDayWorked() {
        UUID other = UUID.randomUUID();
        List<CostRate> rates = List.of(
                CostRate.from(ORG, PERSON, Money.of("10000", "RWF"), LocalDate.of(2026, 1, 1), NOW),
                CostRate.from(ORG, PERSON, Money.of("12000", "RWF"), LocalDate.of(2026, 9, 30), NOW));
        List<TimeEntry> approved = List.of(
                entry(line(WEEK_40.monday(), "8")),
                entry(line(WEEK_40.monday().plusDays(3), "2.5")),
                TimeEntry.of(ORG, other, UUID.randomUUID(), "K-1", "Task", line(WEEK_40.monday(), "3")));

        CostLedger.Costing costing = CostLedger.cost(approved, rates, "RWF");

        assertThat(costing.costByDay())
                .containsEntry(WEEK_40.monday(), Money.of("80000", "RWF"))
                .containsEntry(WEEK_40.monday().plusDays(3), Money.of("30000", "RWF"));
        assertThat(costing.unratedHours()).isEqualByComparingTo("3");
    }

    @Test
    void capacityLosesHolidaysAndLeave() {
        List<CapacityPeriod> periods =
                List.of(CapacityPeriod.from(ORG, PERSON, BigDecimal.valueOf(40), LocalDate.of(2026, 1, 1)));
        Set<DayOfWeek> weekdays = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY);

        assertThat(WeeklyCapacity.of(WEEK_40, periods, weekdays, Set.of(), List.of()))
                .isEqualByComparingTo("40");
        assertThat(WeeklyCapacity.of(WEEK_40, periods, weekdays, Set.of(WEEK_40.monday()), List.of()))
                .isEqualByComparingTo("32");
        Leave twoDays = Leave.of(
                ORG, PERSON, WEEK_40.monday().plusDays(1), WEEK_40.monday().plusDays(2), "Wedding");
        assertThat(WeeklyCapacity.of(WEEK_40, periods, weekdays, Set.of(WEEK_40.monday()), List.of(twoDays)))
                .isEqualByComparingTo("16");
        assertThat(WeeklyCapacity.of(WEEK_40, List.of(), weekdays, Set.of(), List.of()))
                .isEqualByComparingTo("40");
        assertThat(UtilizationBand.of(new BigDecimal("69.9"))).isEqualTo(UtilizationBand.UNDER);
        assertThat(UtilizationBand.of(BigDecimal.valueOf(100))).isEqualTo(UtilizationBand.HEALTHY);
        assertThat(UtilizationBand.of(new BigDecimal("100.1"))).isEqualTo(UtilizationBand.OVER);
    }

    @Test
    void rwandasPublicHolidaysIncludeEasterAndUmuganura() {
        List<Holiday> holidays = PublicHolidays.rwanda(2026);

        assertThat(holidays)
                .extracting(Holiday::date)
                .contains(
                        LocalDate.of(2026, 4, 3),
                        LocalDate.of(2026, 4, 6),
                        LocalDate.of(2026, 4, 7),
                        LocalDate.of(2026, 7, 4),
                        LocalDate.of(2026, 8, 7))
                .isSorted();
        assertThat(holidays).hasSize(13);
    }

    private static TimeEntry.Line line(LocalDate day, String hours) {
        return new TimeEntry.Line(TASK, day, new BigDecimal(hours), null, false);
    }

    private static TimeEntry entry(TimeEntry.Line line) {
        return TimeEntry.of(ORG, PERSON, UUID.randomUUID(), "K-1", "Task", line);
    }
}
