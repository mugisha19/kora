package com.kora.schedule.application;

import com.kora.organization.CurrentMember;
import com.kora.platform.error.ConflictException;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import com.kora.schedule.SchedulePlanning;
import com.kora.schedule.ScheduleQueries;
import com.kora.schedule.application.ProjectSchedule.Row;
import com.kora.schedule.domain.Baseline;
import com.kora.schedule.domain.BaselineTask;
import com.kora.schedule.domain.CyclicDependencyException;
import com.kora.schedule.domain.Dependency;
import com.kora.schedule.domain.SchedulingStrategy;
import com.kora.schedule.domain.SchedulingStrategy.Activity;
import com.kora.schedule.domain.SchedulingStrategy.Schedule;
import com.kora.schedule.domain.SchedulingStrategy.Timing;
import com.kora.schedule.domain.WorkingCalendar;
import com.kora.schedule.domain.WorkingDays;
import com.kora.work.SchedulableTask;
import com.kora.work.WorkQueries;
import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The project schedule (feature 10), computed on every request: the network is small (hundreds of tasks) and the
 * calculation linear, so a stored copy would only add a way to be stale. Baselines are the one thing stored.
 */
@Service
public class ScheduleService implements SchedulePlanning, ScheduleQueries {

    /** A task nobody gave a duration still takes a day, so it shows on the chart and its links mean something. */
    static final int DEFAULT_DURATION = 1;

    private final ProjectAccess projects;
    private final WorkQueries work;
    private final DependencyRepository dependencies;
    private final BaselineRepository baselines;
    private final BaselineTaskRepository baselineTasks;
    private final CalendarService calendar;
    private final SchedulingStrategy strategy;
    private final Clock clock;

    ScheduleService(
            ProjectAccess projects,
            WorkQueries work,
            DependencyRepository dependencies,
            BaselineRepository baselines,
            BaselineTaskRepository baselineTasks,
            CalendarService calendar,
            SchedulingStrategy strategy,
            Clock clock) {
        this.projects = projects;
        this.work = work;
        this.dependencies = dependencies;
        this.baselines = baselines;
        this.baselineTasks = baselineTasks;
        this.calendar = calendar;
        this.strategy = strategy;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ProjectSchedule schedule(UUID projectId) {
        return compute(projects.readable(projectId));
    }

    /** Records every task's early dates as the new baseline, numbered after the previous one. */
    @Transactional
    public Baseline saveBaseline(UUID projectId) {
        ProjectRef project = projects.manageable(projectId);
        ScheduleRules.requirePredictive(project);
        return record(project, CurrentMember.get().userId());
    }

    @Override
    public LocalDate shiftByWorkingDays(LocalDate date, int workingDays) {
        return calendar.current().shift(date, workingDays);
    }

    @Override
    @Transactional
    public boolean rebaseline(ProjectRef project, UUID savedBy) {
        if (!ScheduleRules.isPredictive(project)) {
            return false;
        }
        record(project, savedBy);
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, DateRange> baselineWindows(UUID projectId) {
        return baselines
                .findFirstByProjectIdOrderByNumberDesc(projectId)
                .map(baseline -> baselineTasks.findByBaselineId(baseline.getId()).stream()
                        .collect(Collectors.toMap(
                                BaselineTask::getTaskId,
                                task -> new DateRange(task.getStartDate(), task.getFinishDate()))))
                .orElse(Map.of());
    }

    /** Only the project's id and start date are needed to compute its schedule. */
    @Override
    @Transactional(readOnly = true)
    public Optional<LocalDate> forecastFinish(UUID projectId, LocalDate projectStart) {
        try {
            return Optional.ofNullable(
                    compute(new ProjectRef(projectId, null, null, null, null, null, projectStart, null))
                            .projectFinish());
        } catch (ConflictException loop) {
            return Optional.empty();
        }
    }

    @Override
    @Transactional(readOnly = true)
    public WorkingWeek workingWeek() {
        WorkingCalendar current = calendar.current();
        return new WorkingWeek(
                EnumSet.copyOf(current.getWorkingDays()),
                current.getHolidays().stream()
                        .map(WorkingCalendar.Holiday::date)
                        .collect(Collectors.toSet()));
    }

    private Baseline record(ProjectRef project, UUID savedBy) {
        ProjectSchedule schedule = compute(project);
        int number = baselines
                        .findFirstByProjectIdOrderByNumberDesc(project.id())
                        .map(Baseline::getNumber)
                        .orElse(0)
                + 1;
        Baseline baseline = baselines.save(Baseline.save(
                CurrentMember.get().organizationId(),
                project.id(),
                number,
                savedBy,
                schedule.tasks().size(),
                clock.instant()));
        baselineTasks.saveAll(schedule.tasks().stream()
                .map(row -> BaselineTask.of(baseline, row.task().id(), row.earlyStart(), row.earlyFinish()))
                .toList());
        return baseline;
    }

    private ProjectSchedule compute(ProjectRef project) {
        List<SchedulableTask> tasks = work.schedulable(project.id());
        WorkingDays days = calendar.current().from(project.startDate());
        List<Activity> activities = tasks.stream()
                .map(task -> new Activity(
                        task.id(),
                        duration(task),
                        task.notBefore() == null ? 0 : Math.max(0, days.index(task.notBefore()))))
                .toList();
        Schedule schedule;
        try {
            schedule = strategy.schedule(
                    activities,
                    dependencies.findByProjectIdOrderByCreatedAtAsc(project.id()).stream()
                            .map(Dependency::asLink)
                            .toList());
        } catch (CyclicDependencyException loop) {
            throw ScheduleRules.cycle(loop.cycle(), tasks, "dependencies");
        }
        Optional<Baseline> baseline = baselines.findFirstByProjectIdOrderByNumberDesc(project.id());
        Map<UUID, BaselineTask> planned =
                baseline.map(saved -> baselineTasks.findByBaselineId(saved.getId())).orElse(List.of()).stream()
                        .collect(Collectors.toMap(BaselineTask::getTaskId, Function.identity()));
        Map<UUID, SchedulableTask> byId = ScheduleRules.byId(tasks);
        List<Row> rows = schedule.order().stream()
                .map(id -> row(byId.get(id), schedule.timings().get(id), planned.get(id), days))
                .toList();
        return new ProjectSchedule(
                project.id(),
                days.date(0),
                tasks.isEmpty() ? null : lastDay(schedule.finish(), days),
                baseline.orElse(null),
                rows);
    }

    private static Row row(SchedulableTask task, Timing timing, BaselineTask planned, WorkingDays days) {
        int duration = duration(task);
        LocalDate earlyFinish = finishDate(timing.earlyStart(), duration, days);
        LocalDate lateFinish = finishDate(timing.lateStart(), duration, days);
        Integer startVariance = null;
        Integer finishVariance = null;
        if (planned != null) {
            startVariance = timing.earlyStart() - days.index(planned.getStartDate());
            finishVariance = days.index(earlyFinish) - days.index(planned.getFinishDate());
        }
        return new Row(
                task,
                duration,
                date(timing.earlyStart(), days),
                earlyFinish,
                date(timing.lateStart(), days),
                lateFinish,
                timing.totalFloat(),
                timing.freeFloat(),
                timing.critical(),
                planned == null ? null : planned.getStartDate(),
                planned == null ? null : planned.getFinishDate(),
                startVariance,
                finishVariance);
    }

    /** The last working day of an activity starting on {@code start}; a milestone's is its start. */
    private static LocalDate finishDate(int start, int duration, WorkingDays days) {
        return date(duration == 0 ? start : start + duration - 1, days);
    }

    private static LocalDate lastDay(int exclusiveFinish, WorkingDays days) {
        return date(Math.max(exclusiveFinish - 1, 0), days);
    }

    /** Leads can pull a late start before the project start; such dates are shown on the first day. */
    private static LocalDate date(int day, WorkingDays days) {
        return days.date(Math.max(day, 0));
    }

    private static int duration(SchedulableTask task) {
        return task.durationDays() == null ? DEFAULT_DURATION : task.durationDays();
    }
}
