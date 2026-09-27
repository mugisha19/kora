package com.kora.resourcing.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.metrics.BusinessMetrics;
import com.kora.portfolio.ProjectAccess;
import com.kora.resourcing.ActualCostRecorded;
import com.kora.resourcing.ResourcingErrorCodes;
import com.kora.resourcing.TimesheetDecided;
import com.kora.resourcing.domain.IsoWeek;
import com.kora.resourcing.domain.TimeEntry;
import com.kora.resourcing.domain.Timesheet;
import com.kora.resourcing.domain.TimesheetStatus;
import com.kora.resourcing.domain.TimesheetWeek;
import com.kora.work.WorkQueries;
import com.kora.work.WorkQueries.TaskRef;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Weekly timesheets (feature 15). A person logs their own time on tasks of projects they work on; each project's
 * managers approve their part of the week, never their own; approved hours become actual cost.
 */
@Service
public class TimesheetService {

    private static final BigDecimal QUARTER = new BigDecimal("0.25");

    private final TimesheetRepository timesheets;
    private final ProjectAccess projects;
    private final WorkQueries work;
    private final OrganizationTimeZone timeZone;
    private final BusinessMetrics metrics;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    TimesheetService(
            TimesheetRepository timesheets,
            ProjectAccess projects,
            WorkQueries work,
            OrganizationTimeZone timeZone,
            ApplicationEventPublisher events,
            BusinessMetrics metrics,
            Clock clock) {
        this.metrics = metrics;
        this.timesheets = timesheets;
        this.projects = projects;
        this.work = work;
        this.timeZone = timeZone;
        this.events = events;
        this.clock = clock;
    }

    public record EntryInput(UUID taskId, LocalDate date, BigDecimal hours, String note, boolean billable) {}

    /** The caller's week; the current one (in the organization's time zone) when none is given. */
    @Transactional(readOnly = true)
    public TimesheetWeek myWeek(String week) {
        return weekOf(
                me(),
                week == null
                        ? IsoWeek.containing(LocalDate.now(clock.withZone(timeZone.zone())))
                        : IsoWeek.parse(week, "week"));
    }

    /**
     * Replaces the caller's entries for the week. Entries of submitted or approved project timesheets must come back
     * unchanged; the others are replaced by the list.
     */
    @Transactional
    public TimesheetWeek replace(String weekText, List<EntryInput> inputs) {
        IsoWeek week = IsoWeek.parse(weekText, "week");
        UUID me = me();
        Map<UUID, TaskRef> tasks =
                work.tasks(inputs.stream().map(EntryInput::taskId).distinct().toList());
        Map<UUID, List<TimeEntry.Line>> linesByProject = new LinkedHashMap<>();
        List<TimeEntry.Line> allLines = new ArrayList<>();
        for (int i = 0; i < inputs.size(); i++) {
            EntryInput input = inputs.get(i);
            TaskRef task = tasks.get(input.taskId());
            if (task == null) {
                throw invalid("entries[" + i + "].taskId", "no such task");
            }
            if (!week.contains(input.date())) {
                throw invalid("entries[" + i + "].date", "must be in the week " + week);
            }
            if (input.hours().remainder(QUARTER).signum() != 0) {
                throw invalid("entries[" + i + "].hours", "must be in quarter hours");
            }
            TimeEntry.Line line =
                    new TimeEntry.Line(task.id(), input.date(), input.hours(), input.note(), input.billable());
            linesByProject
                    .computeIfAbsent(task.projectId(), id -> new ArrayList<>())
                    .add(line);
            allLines.add(line);
        }
        TimesheetWeek.checkDailyTotals(allLines, week);
        linesByProject.keySet().forEach(projects::participating);

        Map<UUID, Timesheet> sheets = new HashMap<>();
        timesheets
                .findByUserIdAndWeekStart(me, week.monday())
                .forEach(sheet -> sheets.put(sheet.getProjectId(), sheet));
        for (Timesheet sheet : sheets.values()) {
            List<TimeEntry.Line> sent = linesByProject.getOrDefault(sheet.getProjectId(), List.of());
            if (!sheet.getStatus().isEditable() && !sheet.hasLines(sent)) {
                throw new ConflictException(
                        ResourcingErrorCodes.LOCKED,
                        "The timesheet for this project is " + sheet.getStatus() + "; its entries can't change");
            }
        }
        for (Map.Entry<UUID, List<TimeEntry.Line>> project : linesByProject.entrySet()) {
            Timesheet sheet = sheets.computeIfAbsent(
                    project.getKey(), id -> Timesheet.open(CurrentMember.get().organizationId(), me, id, week));
            if (sheet.getStatus().isEditable()) {
                sheet.replaceEntries(project.getValue().stream()
                        .map(line -> entry(me, project.getKey(), tasks.get(line.taskId()), line))
                        .toList());
                timesheets.saveAndFlush(sheet);
            }
        }
        for (Timesheet sheet : sheets.values()) {
            if (!linesByProject.containsKey(sheet.getProjectId())
                    && sheet.getStatus().isEditable()) {
                sheet.replaceEntries(List.of());
                if (sheet.getStatus() == TimesheetStatus.DRAFT) {
                    timesheets.delete(sheet);
                } else {
                    timesheets.saveAndFlush(sheet);
                }
            }
        }
        return weekOf(me, week);
    }

    /** Sends every editable project timesheet that has entries to its project's managers. */
    @Transactional
    public TimesheetWeek submit(String weekText) {
        IsoWeek week = IsoWeek.parse(weekText, "week");
        UUID me = me();
        List<Timesheet> ready = timesheets.findByUserIdAndWeekStart(me, week.monday()).stream()
                .filter(sheet -> sheet.getStatus().isEditable() && !sheet.isEmpty())
                .toList();
        if (ready.isEmpty()) {
            throw new ConflictException(ResourcingErrorCodes.EMPTY, "There is no time to submit for " + week);
        }
        ready.forEach(sheet -> {
            sheet.submit(clock.instant());
            timesheets.saveAndFlush(sheet);
        });
        return weekOf(me, week);
    }

    /** For the project's managers: oldest week first. */
    @Transactional(readOnly = true)
    public Page<Timesheet> forProject(UUID projectId, TimesheetStatus status, String week, Pageable pageable) {
        projects.manageable(projectId);
        LocalDate weekStart = week == null ? null : IsoWeek.parse(week, "week").monday();
        return timesheets.search(
                projectId,
                status,
                weekStart,
                PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), Sort.by("weekStart", "userId")));
    }

    /** Its owner or the project's managers. */
    @Transactional(readOnly = true)
    public Timesheet get(UUID timesheetId) {
        Timesheet sheet = find(timesheetId);
        if (!sheet.getUserId().equals(me())) {
            projects.manageable(sheet.getProjectId());
        }
        return sheet;
    }

    @Transactional
    public Timesheet approve(UUID timesheetId) {
        Timesheet sheet = find(timesheetId);
        projects.manageable(sheet.getProjectId());
        sheet.approve(me(), clock.instant());
        Timesheet saved = timesheets.saveAndFlush(sheet);
        events.publishEvent(new ActualCostRecorded(sheet.getProjectId()));
        announceDecision(saved);
        return saved;
    }

    @Transactional
    public Timesheet reject(UUID timesheetId, String comment) {
        Timesheet sheet = find(timesheetId);
        projects.manageable(sheet.getProjectId());
        sheet.reject(me(), comment, clock.instant());
        Timesheet saved = timesheets.saveAndFlush(sheet);
        announceDecision(saved);
        return saved;
    }

    private void announceDecision(Timesheet sheet) {
        metrics.decision("timesheet", sheet.getStatus() == TimesheetStatus.APPROVED);
        events.publishEvent(new TimesheetDecided(
                sheet.getId() + ":" + sheet.getDecidedAt(),
                CurrentMember.get().organizationId(),
                sheet.getProjectId(),
                sheet.getId(),
                sheet.getUserId(),
                new IsoWeek(sheet.getWeekStart()).toString(),
                sheet.getStatus() == TimesheetStatus.APPROVED,
                sheet.getComment(),
                me()));
    }

    private TimesheetWeek weekOf(UUID userId, IsoWeek week) {
        return new TimesheetWeek(week, timesheets.findByUserIdAndWeekStart(userId, week.monday()));
    }

    /** A stranger's timesheet is 404, like any other record of a project they can't see. */
    private Timesheet find(UUID timesheetId) {
        Timesheet sheet =
                timesheets.findById(timesheetId).orElseThrow(() -> NotFoundException.of("Timesheet", timesheetId));
        if (!sheet.getUserId().equals(me())) {
            projects.readable(sheet.getProjectId());
        }
        return sheet;
    }

    private static TimeEntry entry(UUID userId, UUID projectId, TaskRef task, TimeEntry.Line line) {
        return TimeEntry.of(CurrentMember.get().organizationId(), userId, projectId, task.key(), task.title(), line);
    }

    private static UUID me() {
        return CurrentMember.get().userId();
    }

    private static InvalidInputException invalid(String field, String message) {
        return new InvalidInputException(FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, message));
    }
}
