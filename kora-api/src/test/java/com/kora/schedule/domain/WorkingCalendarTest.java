package com.kora.schedule.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.InvalidInputException;
import com.kora.schedule.domain.WorkingCalendar.Holiday;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Feature 10: working days skip weekends and holidays, in both directions. */
class WorkingCalendarTest {

    private static final LocalDate SATURDAY = LocalDate.of(2026, 10, 3);
    private static final LocalDate TUESDAY_HOLIDAY = LocalDate.of(2026, 10, 6);

    private final WorkingDays days = new WorkingDays(WorkingCalendar.WEEKDAYS, Set.of(TUESDAY_HOLIDAY), SATURDAY);

    @Test
    void dayZeroIsTheFirstWorkingDayOnOrAfterTheOrigin() {
        assertThat(days.date(0)).isEqualTo(LocalDate.of(2026, 10, 5));
        assertThat(days.date(1)).isEqualTo(LocalDate.of(2026, 10, 7));
        assertThat(days.date(4)).isEqualTo(LocalDate.of(2026, 10, 12));
    }

    @Test
    void aDateMapsToTheFirstWorkingDayOnOrAfterIt() {
        assertThat(days.index(LocalDate.of(2026, 10, 7))).isEqualTo(1);
        assertThat(days.index(TUESDAY_HOLIDAY)).isEqualTo(1);
        assertThat(days.index(LocalDate.of(2026, 10, 10))).isEqualTo(4);
        assertThat(days.index(SATURDAY)).isZero();
        assertThat(days.index(LocalDate.of(2026, 10, 1))).isEqualTo(-2);
    }

    @Test
    void aSixDayWeekWorksOnSaturdays() {
        WorkingDays sixDays = new WorkingDays(EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.SATURDAY), Set.of(), SATURDAY);

        assertThat(sixDays.date(0)).isEqualTo(SATURDAY);
        assertThat(sixDays.date(1)).isEqualTo(LocalDate.of(2026, 10, 5));
    }

    @Test
    void theStandardCalendarIsMondayToFridayWithoutHolidays() {
        WorkingCalendar calendar = WorkingCalendar.standard(UUID.randomUUID());

        assertThat(calendar.getWorkingDays()).containsExactlyElementsOf(WorkingCalendar.WEEKDAYS);
        assertThat(calendar.getHolidays()).isEmpty();
        assertThat(calendar.getVersion()).isZero();
    }

    @Test
    void replacingSortsHolidaysAndRefusesAnEmptyWeekOrDuplicates() {
        WorkingCalendar calendar = WorkingCalendar.standard(UUID.randomUUID());
        calendar.replace(
                EnumSet.of(DayOfWeek.FRIDAY, DayOfWeek.MONDAY),
                List.of(
                        new Holiday(LocalDate.of(2026, 12, 25), " Christmas "),
                        new Holiday(TUESDAY_HOLIDAY, "Closure")));

        assertThat(calendar.getWorkingDays()).containsExactly(DayOfWeek.MONDAY, DayOfWeek.FRIDAY);
        assertThat(calendar.getHolidays())
                .containsExactly(
                        new Holiday(TUESDAY_HOLIDAY, "Closure"), new Holiday(LocalDate.of(2026, 12, 25), "Christmas"));
        assertThatThrownBy(() -> calendar.replace(Set.of(), List.of())).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> calendar.replace(
                        WorkingCalendar.WEEKDAYS,
                        List.of(new Holiday(TUESDAY_HOLIDAY, "A"), new Holiday(TUESDAY_HOLIDAY, "B"))))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    void aWeekWithoutWorkingDaysIsRefused() {
        assertThatThrownBy(() -> new WorkingDays(Set.of(), Set.of(), SATURDAY))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
