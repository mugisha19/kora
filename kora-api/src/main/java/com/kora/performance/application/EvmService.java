package com.kora.performance.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationCurrency;
import com.kora.organization.OrganizationTimeZone;
import com.kora.performance.domain.EacMethod;
import com.kora.performance.domain.EarnedValueAnalysis;
import com.kora.performance.domain.EvmSettings;
import com.kora.performance.domain.EvmSnapshot;
import com.kora.performance.domain.PercentCompleteMethod;
import com.kora.performance.domain.PlannedValue;
import com.kora.performance.domain.PlannedValue.PlannedWork;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectSnapshotSource;
import com.kora.resourcing.ActualCosts;
import com.kora.resourcing.ActualCosts.Ledger;
import com.kora.schedule.ScheduleQueries;
import com.kora.schedule.ScheduleQueries.DateRange;
import com.kora.scope.WbsQueries;
import com.kora.scope.WbsQueries.WorkPackageFigures;
import com.kora.work.WorkQueries;
import com.kora.work.WorkQueries.StoryPoints;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Earned value management (feature 17). Inputs come from the modules that own them: BAC and percent complete from
 * the WBS, planned windows from the schedule baseline, story points from tasks, actual cost from approved
 * timesheets. Nothing is stored except the settings and the weekly snapshots.
 */
@Service
public class EvmService {

    static final int MAX_WEEKS = 104;
    static final String NO_STORY_POINTS = "No story points are estimated yet";

    private final ProjectAccess projects;
    private final ProjectQueries projectQueries;
    private final WbsQueries wbs;
    private final ScheduleQueries schedule;
    private final WorkQueries work;
    private final ActualCosts actualCosts;
    private final EvmSettingsRepository settings;
    private final EvmSnapshotRepository snapshots;
    private final OrganizationCurrency currency;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    EvmService(
            ProjectAccess projects,
            ProjectQueries projectQueries,
            WbsQueries wbs,
            ScheduleQueries schedule,
            WorkQueries work,
            ActualCosts actualCosts,
            EvmSettingsRepository settings,
            EvmSnapshotRepository snapshots,
            OrganizationCurrency currency,
            OrganizationTimeZone timeZone,
            Clock clock) {
        this.projects = projects;
        this.projectQueries = projectQueries;
        this.wbs = wbs;
        this.schedule = schedule;
        this.work = work;
        this.actualCosts = actualCosts;
        this.settings = settings;
        this.snapshots = snapshots;
        this.currency = currency;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    /** The metrics with the methods that produced them. */
    public record Report(
            UUID projectId,
            LocalDate asOf,
            EvmSettings settings,
            EarnedValueAnalysis analysis,
            BigDecimal unratedHours) {}

    /** Cumulative figures at the end of a week (Sunday); EV and AC only where known. */
    public record Point(LocalDate weekEnding, Money pv, Money ev, Money ac) {}

    public record Series(UUID projectId, Money bac, List<Point> points) {}

    @Transactional(readOnly = true)
    public Report report(UUID projectId) {
        projects.readable(projectId);
        return analyse(projectId, today());
    }

    @Transactional(readOnly = true)
    public Series series(UUID projectId, LocalDate from, LocalDate to) {
        projects.readable(projectId);
        Inputs inputs = inputs(projectId);
        LocalDate today = today();
        LocalDate first = sundayOf(from != null ? from : inputs.source().startDate());
        LocalDate last = sundayOf(to != null ? to : inputs.source().targetEndDate());
        long weeks = ChronoUnit.WEEKS.between(first, last) + 1;
        if (weeks < 1 || weeks > MAX_WEEKS) {
            throw new InvalidInputException(FieldViolation.of(
                    "to", PlatformErrorCodes.Field.RANGE, "the range covers 1 to " + MAX_WEEKS + " weeks"));
        }
        Map<LocalDate, EvmSnapshot> recorded =
                snapshots
                        .findByProjectIdAndWeekStartBetweenOrderByWeekStartAsc(projectId, first.minusDays(6), last)
                        .stream()
                        .collect(Collectors.toMap(EvmSnapshot::getWeekStart, Function.identity()));
        LocalDate thisWeek = sundayOf(today);
        Money liveEv = thisWeek.isBefore(first) || thisWeek.isAfter(last)
                ? null
                : inputs.earned().orElse(null);
        List<Point> points = new ArrayList<>();
        for (LocalDate sunday = first; !sunday.isAfter(last); sunday = sunday.plusWeeks(1)) {
            Money pv = PlannedValue.asOf(inputs.planned(), sunday, inputs.currency());
            Money ac = sunday.isAfter(thisWeek) ? null : inputs.ledger().upTo(sunday);
            Money ev;
            if (sunday.equals(thisWeek)) {
                ev = liveEv;
            } else if (sunday.isBefore(thisWeek)) {
                EvmSnapshot snapshot = recorded.get(sunday.minusDays(6));
                ev = snapshot == null ? null : snapshot.ev();
            } else {
                ev = null;
            }
            points.add(new Point(sunday, pv, ev, ac));
        }
        return new Series(projectId, inputs.bac(), points);
    }

    @Transactional(readOnly = true)
    public EvmSettings settings(UUID projectId) {
        projects.readable(projectId);
        return settingsOf(projectId);
    }

    @Transactional
    public EvmSettings choose(
            UUID projectId, long expectedVersion, PercentCompleteMethod percentComplete, EacMethod eac) {
        projects.manageable(projectId);
        EvmSettings current = settings.findById(projectId)
                .orElseGet(() -> settings.saveAndFlush(
                        EvmSettings.standard(CurrentMember.get().organizationId(), projectId)));
        OptimisticLock.check(expectedVersion, current.getVersion());
        current.choose(percentComplete, eac);
        return settings.saveAndFlush(current);
    }

    /** No access check: for the snapshots and the dashboard, which work in the tenant scope. */
    Report analyse(UUID projectId, LocalDate asOf) {
        Inputs inputs = inputs(projectId);
        EarnedValueAnalysis analysis = EarnedValueAnalysis.of(
                inputs.bac(),
                PlannedValue.asOf(inputs.planned(), asOf, inputs.currency()),
                inputs.earned().orElse(null),
                NO_STORY_POINTS,
                inputs.ledger().upTo(asOf),
                inputs.settings().getEacMethod());
        return new Report(
                projectId, asOf, inputs.settings(), analysis, inputs.ledger().unratedHours());
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(timeZone.zone()));
    }

    /** Everything the metrics are computed from, gathered once. */
    private record Inputs(
            ProjectSnapshotSource source,
            String currency,
            EvmSettings settings,
            Money bac,
            List<PlannedWork> planned,
            Optional<Money> earned,
            Ledger ledger) {}

    private Inputs inputs(UUID projectId) {
        ProjectSnapshotSource source =
                projectQueries.snapshotSource(projectId).orElseThrow(() -> NotFoundException.of("Project", projectId));
        String organizationCurrency = currency.current();
        EvmSettings chosen = settingsOf(projectId);
        List<WorkPackageFigures> workPackages = wbs.workPackages(projectId, organizationCurrency);
        Money bac = workPackages.stream()
                .map(WorkPackageFigures::plannedCost)
                .reduce(Money.zero(organizationCurrency), Money::plus);
        Map<UUID, DateRange> windows = windows(projectId);
        List<PlannedWork> planned = workPackages.stream()
                .map(wp -> {
                    DateRange window = windows.get(wp.nodeId());
                    return window == null
                            ? new PlannedWork(wp.plannedCost(), source.startDate(), source.targetEndDate())
                            : new PlannedWork(wp.plannedCost(), window.start(), window.finish());
                })
                .toList();
        StoryPoints points = chosen.getPercentCompleteMethod() == PercentCompleteMethod.STORY_POINTS
                ? work.storyPoints(projectId)
                : new StoryPoints(0, 0);
        Optional<Money> earned = chosen.getPercentCompleteMethod()
                .earned(
                        workPackages.stream()
                                .map(wp ->
                                        new PercentCompleteMethod.WorkPackage(wp.plannedCost(), wp.percentComplete()))
                                .toList(),
                        bac,
                        points.done(),
                        points.total());
        return new Inputs(
                source,
                organizationCurrency,
                chosen,
                bac,
                planned,
                earned,
                actualCosts.ledger(projectId, organizationCurrency));
    }

    /**
     * A work package's planned window: from the earliest baseline start to the latest baseline finish of its tasks.
     * Work packages without baselined tasks are spread over the whole project.
     */
    private Map<UUID, DateRange> windows(UUID projectId) {
        Map<UUID, DateRange> byTask = schedule.baselineWindows(projectId);
        Map<UUID, UUID> workPackageOf = work.workPackagesOfTasks(projectId);
        Map<UUID, DateRange> byWorkPackage = new HashMap<>();
        byTask.forEach((taskId, range) -> {
            UUID workPackage = workPackageOf.get(taskId);
            if (workPackage != null) {
                byWorkPackage.merge(
                        workPackage,
                        range,
                        (a, b) -> new DateRange(
                                a.start().isBefore(b.start()) ? a.start() : b.start(),
                                a.finish().isAfter(b.finish()) ? a.finish() : b.finish()));
            }
        });
        return byWorkPackage;
    }

    private EvmSettings settingsOf(UUID projectId) {
        // The defaults are only read, never saved from here, so they need no organization.
        return settings.findById(projectId).orElseGet(() -> EvmSettings.standard(null, projectId));
    }

    private static LocalDate sundayOf(LocalDate day) {
        return day.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
    }
}
