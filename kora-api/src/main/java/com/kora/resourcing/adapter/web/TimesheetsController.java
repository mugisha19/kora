package com.kora.resourcing.adapter.web;

import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.PageResponse;
import com.kora.platform.web.UserRefJson;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectSnapshotSource;
import com.kora.resourcing.application.PeopleAndRates;
import com.kora.resourcing.application.TimesheetService;
import com.kora.resourcing.application.TimesheetService.EntryInput;
import com.kora.resourcing.domain.CostRate;
import com.kora.resourcing.domain.TimeEntry;
import com.kora.resourcing.domain.Timesheet;
import com.kora.resourcing.domain.TimesheetStatus;
import com.kora.resourcing.domain.TimesheetWeek;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Timesheets} (feature 15). */
@RestController
class TimesheetsController {

    private final TimesheetService timesheets;
    private final PeopleAndRates people;
    private final MemberDirectory members;
    private final UserAccounts accounts;
    private final ProjectQueries projects;

    TimesheetsController(
            TimesheetService timesheets,
            PeopleAndRates people,
            MemberDirectory members,
            UserAccounts accounts,
            ProjectQueries projects) {
        this.timesheets = timesheets;
        this.people = people;
        this.members = members;
        this.accounts = accounts;
        this.projects = projects;
    }

    record TimesheetEntryResponse(
            UUID id,
            UUID taskId,
            String taskKey,
            String taskTitle,
            UUID projectId,
            LocalDate date,
            BigDecimal hours,
            String note,
            boolean billable) {}

    record TimesheetResponse(
            UUID id,
            UUID projectId,
            String projectCode,
            UserRefJson user,
            LocalDate weekStart,
            TimesheetStatus status,
            BigDecimal totalHours,
            Instant submittedAt,
            UserRefJson decidedBy,
            Instant decidedAt,
            String comment,
            List<TimesheetEntryResponse> entries) {}

    record DailyTotalResponse(LocalDate date, BigDecimal hours) {}

    record TimesheetWeekResponse(
            String week,
            LocalDate weekStart,
            LocalDate weekEnd,
            TimesheetStatus status,
            boolean editable,
            BigDecimal totalHours,
            List<DailyTotalResponse> dailyTotals,
            List<TimesheetEntryResponse> entries,
            List<TimesheetResponse> sheets) {}

    record EntryJson(
            @NotNull UUID taskId,
            @NotNull LocalDate date,
            @NotNull @DecimalMin("0.25") @DecimalMax("24") BigDecimal hours,
            @Size(max = 500) String note,
            Boolean billable) {}

    record TimesheetEntriesRequest(@NotNull @Size(max = 500) List<@Valid @NotNull EntryJson> entries) {}

    record RejectTimesheetRequest(
            @NotBlank @Size(max = 1000) String comment) {}

    record CostRateResponse(UUID id, UUID userId, MoneyJson hourlyRate, LocalDate validFrom, Instant createdAt) {}

    record CreateCostRateRequest(
            @NotNull @Valid MoneyJson hourlyRate, @NotNull LocalDate validFrom) {}

    @GetMapping("/api/v1/timesheets/me")
    TimesheetWeekResponse myWeek(@RequestParam(name = "week", required = false) String week) {
        return week(timesheets.myWeek(week));
    }

    @PutMapping("/api/v1/timesheets/me/{week}/entries")
    TimesheetWeekResponse replace(@PathVariable("week") String week, @Valid @RequestBody TimesheetEntriesRequest body) {
        return week(timesheets.replace(
                week,
                body.entries().stream()
                        .map(entry -> new EntryInput(
                                entry.taskId(),
                                entry.date(),
                                entry.hours(),
                                entry.note(),
                                Boolean.TRUE.equals(entry.billable())))
                        .toList()));
    }

    @PostMapping("/api/v1/timesheets/me/{week}/submit")
    TimesheetWeekResponse submit(@PathVariable("week") String week) {
        return week(timesheets.submit(week));
    }

    @GetMapping("/api/v1/projects/{projectId}/timesheets")
    PageResponse<TimesheetResponse> forProject(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "status", required = false) TimesheetStatus status,
            @RequestParam(name = "week", required = false) String week,
            Pageable pageable) {
        Page<Timesheet> page = timesheets.forProject(projectId, status, week, pageable);
        return PageResponse.from(
                new PageImpl<>(sheets(page.getContent(), false), page.getPageable(), page.getTotalElements()));
    }

    @GetMapping("/api/v1/timesheets/{timesheetId}")
    TimesheetResponse get(@PathVariable("timesheetId") UUID timesheetId) {
        return sheets(List.of(timesheets.get(timesheetId)), true).getFirst();
    }

    @PostMapping("/api/v1/timesheets/{timesheetId}/approve")
    TimesheetResponse approve(@PathVariable("timesheetId") UUID timesheetId) {
        return sheets(List.of(timesheets.approve(timesheetId)), true).getFirst();
    }

    @PostMapping("/api/v1/timesheets/{timesheetId}/reject")
    TimesheetResponse reject(
            @PathVariable("timesheetId") UUID timesheetId, @Valid @RequestBody RejectTimesheetRequest body) {
        return sheets(List.of(timesheets.reject(timesheetId, body.comment())), true)
                .getFirst();
    }

    @GetMapping("/api/v1/users/{userId}/cost-rates")
    List<CostRateResponse> rates(@PathVariable("userId") UUID userId) {
        return people.rates(userId).stream().map(TimesheetsController::rate).toList();
    }

    @PostMapping("/api/v1/users/{userId}/cost-rates")
    @ResponseStatus(HttpStatus.CREATED)
    CostRateResponse addRate(@PathVariable("userId") UUID userId, @Valid @RequestBody CreateCostRateRequest body) {
        return rate(people.addRate(
                userId,
                MoneyJson.parse(
                        "hourlyRate.amount",
                        body.hourlyRate().amount(),
                        body.hourlyRate().currency()),
                body.validFrom()));
    }

    private TimesheetWeekResponse week(TimesheetWeek week) {
        List<TimesheetResponse> sheets = sheets(week.sheets(), false);
        return new TimesheetWeekResponse(
                week.week().toString(),
                week.week().monday(),
                week.week().sunday(),
                week.status(),
                week.editable(),
                week.totalHours(),
                week.dailyTotals().entrySet().stream()
                        .map(day -> new DailyTotalResponse(day.getKey(), day.getValue()))
                        .toList(),
                week.entries().stream().map(TimesheetsController::entry).toList(),
                sheets);
    }

    /** One name lookup and one project lookup per page. */
    private List<TimesheetResponse> sheets(List<Timesheet> sheets, boolean withEntries) {
        List<UUID> ids = new ArrayList<>();
        sheets.forEach(sheet -> {
            ids.add(sheet.getUserId());
            ids.add(sheet.getDecidedBy());
        });
        Map<UUID, String> names = names(ids);
        Map<UUID, String> codes = new HashMap<>();
        return sheets.stream()
                .map(sheet -> new TimesheetResponse(
                        sheet.getId(),
                        sheet.getProjectId(),
                        codes.computeIfAbsent(
                                sheet.getProjectId(),
                                id -> projects.snapshotSource(id)
                                        .map(ProjectSnapshotSource::code)
                                        .orElse("")),
                        ref(sheet.getUserId(), names),
                        sheet.getWeekStart(),
                        sheet.getStatus(),
                        sheet.totalHours(),
                        sheet.getSubmittedAt(),
                        ref(sheet.getDecidedBy(), names),
                        sheet.getDecidedAt(),
                        sheet.getComment(),
                        withEntries
                                ? sheet.getEntries().stream()
                                        .map(TimesheetsController::entry)
                                        .toList()
                                : null))
                .toList();
    }

    private static TimesheetEntryResponse entry(TimeEntry entry) {
        return new TimesheetEntryResponse(
                entry.getId(),
                entry.getTaskId(),
                entry.getTaskKey(),
                entry.getTaskTitle(),
                entry.getProjectId(),
                entry.getDate(),
                entry.getHours(),
                entry.getNote(),
                entry.isBillable());
    }

    private static CostRateResponse rate(CostRate rate) {
        return new CostRateResponse(
                rate.getId(),
                rate.getUserId(),
                MoneyJson.from(rate.getHourlyRate()),
                rate.getValidFrom(),
                rate.getCreatedAt());
    }

    private static UserRefJson ref(UUID userId, Map<UUID, String> names) {
        return userId == null ? null : new UserRefJson(userId, names.get(userId));
    }

    private Map<UUID, String> names(Collection<UUID> userIds) {
        List<UUID> ids = userIds.stream().filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> names = new HashMap<>();
        members.findAll(ids).forEach((id, member) -> names.put(id, member.fullName()));
        ids.forEach(
                id -> names.computeIfAbsent(id, missing -> accounts.get(missing).fullName()));
        return names;
    }
}
