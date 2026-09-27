package com.kora.reporting.application;

import com.kora.governance.ChangeRequestChanged;
import com.kora.governance.GovernanceQueries;
import com.kora.governance.RiskChanged;
import com.kora.organization.OrganizationCurrency;
import com.kora.organization.OrganizationTimeZone;
import com.kora.performance.EvmQueries;
import com.kora.platform.tenancy.TenantScope;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.portfolio.Health;
import com.kora.portfolio.ProjectChanged;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectQueries.ProjectKey;
import com.kora.portfolio.ProjectSnapshotSource;
import com.kora.reporting.domain.HealthRule;
import com.kora.reporting.domain.ProjectSnapshot;
import com.kora.resourcing.ActualCostRecorded;
import com.kora.schedule.ScheduleQueries;
import com.kora.scope.WbsChanged;
import com.kora.scope.WbsQueries;
import com.kora.scope.WbsTotals;
import com.kora.work.TaskChanged;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps the dashboard read model in step with the modules that own the data (Observer). It listens synchronously, so
 * the snapshot is written in the same transaction as the change: the dashboard is never behind a committed change,
 * and a rolled-back change leaves no trace. An hourly pass catches what time alone changes (a project becoming late).
 */
@Component
class SnapshotRefresher {

    private static final Logger LOG = LoggerFactory.getLogger(SnapshotRefresher.class);

    private static final Set<String> PLAN_DRIVEN = Set.of("PREDICTIVE", "HYBRID");

    private final ProjectQueries projects;
    private final WbsQueries wbs;
    private final GovernanceQueries governance;
    private final EvmQueries evm;
    private final ScheduleQueries schedule;
    private final SnapshotRepository snapshots;
    private final OrganizationCurrency currency;
    private final OrganizationTimeZone timeZone;
    private final TenantTransactions transactions;
    private final Clock clock;

    SnapshotRefresher(
            ProjectQueries projects,
            WbsQueries wbs,
            GovernanceQueries governance,
            EvmQueries evm,
            ScheduleQueries schedule,
            SnapshotRepository snapshots,
            OrganizationCurrency currency,
            OrganizationTimeZone timeZone,
            TenantTransactions transactions,
            Clock clock) {
        this.projects = projects;
        this.wbs = wbs;
        this.governance = governance;
        this.evm = evm;
        this.schedule = schedule;
        this.snapshots = snapshots;
        this.currency = currency;
        this.timeZone = timeZone;
        this.transactions = transactions;
        this.clock = clock;
    }

    @EventListener
    void on(ProjectChanged event) {
        refresh(event.projectId());
    }

    @EventListener
    void on(WbsChanged event) {
        refresh(event.projectId());
    }

    /** A critical risk past its response date turns health red (feature 11). */
    @EventListener
    void on(RiskChanged event) {
        refresh(event.projectId());
    }

    /** Pending change requests are counted on the dashboard (feature 14). */
    @EventListener
    void on(ChangeRequestChanged event) {
        refresh(event.projectId());
    }

    /** Approved hours move actual cost and CPI (feature 17). */
    @EventListener
    void on(ActualCostRecorded event) {
        refresh(event.projectId());
    }

    /** Task progress moves the WBS percent complete (feature 08). */
    @EventListener
    void on(TaskChanged event) {
        refresh(event.projectId());
    }

    @Scheduled(
            initialDelayString = "${kora.reporting.snapshot-refresh.initial-delay:PT5M}",
            fixedDelayString = "${kora.reporting.snapshot-refresh.interval:PT1H}")
    void refreshAll() {
        List<ProjectKey> all = transactions.readInSystem(projects::allProjects);
        for (ProjectKey key : all) {
            transactions.inOrganization(key.organizationId(), () -> {
                refresh(key.projectId());
                return null;
            });
        }
        LOG.info("Refreshed {} project snapshots", all.size());
    }

    /**
     * Rebuilds one project's row from its sources and records the computed health on the project. Runs inside the
     * caller's transaction: the changing module's (listeners are synchronous) or the hourly job's.
     */
    /** Plan-driven projects are measured against the critical path's forecast; Agile ones plan in sprints. */
    private Optional<LocalDate> forecastFinishOf(ProjectSnapshotSource source) {
        if (!PLAN_DRIVEN.contains(source.methodology())) {
            return Optional.empty();
        }
        return schedule.forecastFinish(source.projectId(), source.startDate());
    }

    private LocalDate forecastFinish(ProjectSnapshotSource source) {
        return forecastFinishOf(source).orElse(null);
    }

    void refresh(UUID projectId) {
        Optional<ProjectSnapshotSource> found = projects.snapshotSource(projectId);
        if (found.isEmpty()) {
            snapshots.findById(projectId).ifPresent(snapshots::delete);
            return;
        }
        ProjectSnapshotSource source = found.get();
        String organizationCurrency = currency.current();
        WbsTotals totals = wbs.totals(projectId, organizationCurrency);
        // "Today" where the organization is: in Kigali the day starts two hours before it does in UTC.
        LocalDate today = LocalDate.now(clock.withZone(timeZone.zone()));
        EvmQueries.Figures figures = evm.current(projectId);
        HealthRule.Result computed = HealthRule.evaluate(new HealthRule.Inputs(
                source.status(),
                source.targetEndDate(),
                today,
                figures.spi(),
                figures.cpi(),
                governance.criticalRiskOverdue(projectId, today),
                forecastFinish(source)));
        projects.recordComputedHealth(projectId, computed.health(), computed.reason());
        boolean overridden = source.healthOverride() != null;
        Health health = overridden ? source.healthOverride() : computed.health();
        String reason = overridden ? source.healthOverrideReason() : computed.reason();
        Optional<ProjectSnapshotSource.Milestone> next = source.charterMilestones().stream()
                .filter(milestone -> !milestone.targetDate().isBefore(today))
                .min(Comparator.comparing(ProjectSnapshotSource.Milestone::targetDate));

        ProjectSnapshot snapshot = snapshots
                .findById(projectId)
                .orElseGet(() -> new ProjectSnapshot(projectId, TenantScope.requireOrganization()));
        snapshot.refresh(
                new ProjectSnapshot.Values(
                        source.portfolioId(),
                        source.programId(),
                        source.code(),
                        source.name(),
                        source.managerId(),
                        source.status(),
                        source.methodology(),
                        source.startDate(),
                        source.targetEndDate(),
                        organizationCurrency,
                        source.budget(),
                        totals.plannedCost(),
                        totals.earnedValue(),
                        totals.percentComplete(),
                        next.map(ProjectSnapshotSource.Milestone::name).orElse(null),
                        next.map(ProjectSnapshotSource.Milestone::targetDate).orElse(null),
                        health,
                        reason,
                        overridden,
                        HealthRule.isLate(source.status(), source.targetEndDate(), today)),
                new ProjectSnapshot.Performance(
                        figures.pv(),
                        figures.ev(),
                        figures.ac(),
                        figures.spi(),
                        figures.cpi(),
                        governance.openCriticalRisks(projectId),
                        governance.pendingChangeRequests(projectId)),
                clock.instant());
        snapshots.save(snapshot);
    }
}
