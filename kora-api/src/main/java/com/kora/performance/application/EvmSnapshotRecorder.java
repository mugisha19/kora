package com.kora.performance.application;

import com.kora.performance.domain.EvmSnapshot;
import com.kora.platform.tenancy.TenantScope;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectQueries.ProjectKey;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes each project's weekly EVM snapshot (feature 17): the current week's row is overwritten until the week
 * ends, so it keeps the week's last figures. Runs hourly, like the dashboard's time-based refresh.
 */
@Component
public class EvmSnapshotRecorder {

    private static final Logger LOG = LoggerFactory.getLogger(EvmSnapshotRecorder.class);

    private final EvmService evm;
    private final EvmSnapshotRepository snapshots;
    private final ProjectQueries projects;
    private final TenantTransactions transactions;
    private final Clock clock;

    EvmSnapshotRecorder(
            EvmService evm,
            EvmSnapshotRepository snapshots,
            ProjectQueries projects,
            TenantTransactions transactions,
            Clock clock) {
        this.evm = evm;
        this.snapshots = snapshots;
        this.projects = projects;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Scheduled(
            initialDelayString = "${kora.performance.snapshot.initial-delay:PT10M}",
            fixedDelayString = "${kora.performance.snapshot.interval:PT1H}")
    public void recordAll() {
        List<ProjectKey> all = transactions.readInSystem(projects::allProjects);
        for (ProjectKey key : all) {
            try {
                transactions.inOrganization(key.organizationId(), () -> {
                    record(key.projectId());
                    return null;
                });
            } catch (RuntimeException failure) {
                // One project's bad data must not stop the others' snapshots.
                LOG.warn("Could not record the EVM snapshot of project {}", key.projectId(), failure);
            }
        }
    }

    /** Records the project's figures for the current week, in the active organization. */
    @Transactional
    public void record(UUID projectId) {
        LocalDate today = evm.today();
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        EvmService.Report report = evm.analyse(projectId, today);
        EvmSnapshot snapshot = snapshots
                .findByProjectIdAndWeekStart(projectId, monday)
                .orElseGet(() -> EvmSnapshot.of(TenantScope.requireOrganization(), projectId, monday));
        snapshot.record(report.analysis(), clock.instant());
        snapshots.save(snapshot);
    }
}
