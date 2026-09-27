package com.kora.schedule.adapter.web;

import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.schedule.application.CalendarService;
import com.kora.schedule.domain.WorkingCalendar;
import com.kora.schedule.domain.WorkingCalendar.Holiday;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Schedule}: the organization's working calendar. */
@RestController
class CalendarController {

    private final CalendarService calendars;

    CalendarController(CalendarService calendars) {
        this.calendars = calendars;
    }

    record HolidayJson(
            @NotNull LocalDate date,
            @NotBlank @Size(max = 100) String name) {}

    record WorkingCalendarResponse(List<DayOfWeek> workingDays, List<HolidayJson> holidays, long version) {}

    record UpdateWorkingCalendarRequest(
            @NotNull @Size(min = 1, max = 7) List<@NotNull DayOfWeek> workingDays,
            @NotNull @Size(max = 200) List<@Valid @NotNull HolidayJson> holidays) {}

    record PublicHolidaysRequest(
            @NotNull @Pattern(regexp = "RW") String country,
            @NotNull @Min(2000) @Max(2100) Integer year) {}

    @GetMapping("/api/v1/organization/calendar")
    ResponseEntity<WorkingCalendarResponse> get() {
        return withTag(calendars.current());
    }

    @PutMapping("/api/v1/organization/calendar")
    ResponseEntity<WorkingCalendarResponse> replace(
            @IfMatchVersion long expectedVersion, @Valid @RequestBody UpdateWorkingCalendarRequest body) {
        return withTag(calendars.replace(
                expectedVersion,
                EnumSet.copyOf(body.workingDays()),
                body.holidays().stream()
                        .map(holiday -> new Holiday(holiday.date(), holiday.name()))
                        .toList()));
    }

    @PostMapping("/api/v1/organization/calendar/public-holidays")
    ResponseEntity<WorkingCalendarResponse> addPublicHolidays(
            @IfMatchVersion long expectedVersion, @Valid @RequestBody PublicHolidaysRequest body) {
        return withTag(calendars.addPublicHolidays(expectedVersion, body.country(), body.year()));
    }

    private static ResponseEntity<WorkingCalendarResponse> withTag(WorkingCalendar calendar) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(calendar.getVersion()))
                .body(new WorkingCalendarResponse(
                        calendar.getWorkingDays(),
                        calendar.getHolidays().stream()
                                .map(holiday -> new HolidayJson(holiday.date(), holiday.name()))
                                .toList(),
                        calendar.getVersion()));
    }
}
