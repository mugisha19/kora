package com.kora.schedule.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.persistence.JsonColumnConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Converter;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.hibernate.annotations.TenantId;
import tools.jackson.core.type.TypeReference;

/**
 * An organization's working week and holidays (feature 10). Durations, lags and float are counted in its working
 * days. Stored only once an administrator changes it; {@link #standard} is Monday to Friday without holidays.
 */
@Entity
@Table(name = "working_calendars")
public class WorkingCalendar {

    public static final Set<DayOfWeek> WEEKDAYS = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY);

    /** A named public holiday or closure. */
    public record Holiday(LocalDate date, String name) {}

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Convert(converter = DaysConverter.class)
    @Column(name = "working_days", nullable = false)
    private List<DayOfWeek> workingDays;

    @Convert(converter = HolidaysConverter.class)
    @Column(nullable = false)
    private List<Holiday> holidays;

    @Version
    private Long version;

    protected WorkingCalendar() {
        // for JPA
    }

    /** Monday to Friday, no holidays: what every organization starts with (not saved). */
    public static WorkingCalendar standard(UUID organizationId) {
        WorkingCalendar calendar = new WorkingCalendar();
        calendar.id = UUID.randomUUID();
        calendar.organizationId = organizationId;
        calendar.workingDays = List.copyOf(WEEKDAYS);
        calendar.holidays = List.of();
        return calendar;
    }

    /**
     * Replaces the week and the holidays; the days are kept in week order and the holidays in date order.
     *
     * @throws InvalidInputException when no day is a working day, or a date is listed twice
     */
    public void replace(Set<DayOfWeek> newWorkingDays, List<Holiday> newHolidays) {
        if (newWorkingDays.isEmpty()) {
            throw new InvalidInputException(FieldViolation.of(
                    "workingDays", PlatformErrorCodes.Field.REQUIRED, "at least one day must be a working day"));
        }
        Set<LocalDate> seen = new HashSet<>();
        for (Holiday holiday : newHolidays) {
            if (!seen.add(holiday.date())) {
                throw new InvalidInputException(FieldViolation.of(
                        "holidays", PlatformErrorCodes.Field.INVALID, holiday.date() + " is listed twice"));
            }
        }
        this.workingDays = List.copyOf(EnumSet.copyOf(newWorkingDays));
        this.holidays = newHolidays.stream()
                .map(holiday -> new Holiday(holiday.date(), holiday.name().strip()))
                .sorted(Comparator.comparing(Holiday::date))
                .toList();
    }

    /** Numbers this calendar's working days from {@code origin}. */
    public WorkingDays from(LocalDate origin) {
        return new WorkingDays(
                EnumSet.copyOf(workingDays),
                holidays.stream().map(Holiday::date).collect(Collectors.toSet()),
                Objects.requireNonNull(origin));
    }

    /**
     * The date {@code workingDays} working days after {@code date} (before it when negative), e.g. a target end date
     * moved by an approved change. Zero returns the date itself.
     */
    public LocalDate shift(LocalDate date, int workingDays) {
        Set<LocalDate> closed = holidays.stream().map(Holiday::date).collect(Collectors.toSet());
        int step = workingDays < 0 ? -1 : 1;
        LocalDate day = date;
        for (int remaining = Math.abs(workingDays); remaining > 0; ) {
            day = day.plusDays(step);
            if (workingDays().contains(day.getDayOfWeek()) && !closed.contains(day)) {
                remaining--;
            }
        }
        return day;
    }

    private Set<DayOfWeek> workingDays() {
        return EnumSet.copyOf(workingDays);
    }

    public List<DayOfWeek> getWorkingDays() {
        return workingDays;
    }

    public List<Holiday> getHolidays() {
        return holidays;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }

    @Converter
    public static class DaysConverter extends JsonColumnConverter<List<DayOfWeek>> {
        public DaysConverter() {
            super(new TypeReference<>() {});
        }
    }

    @Converter
    public static class HolidaysConverter extends JsonColumnConverter<List<Holiday>> {
        public HolidaysConverter() {
            super(new TypeReference<>() {});
        }
    }
}
