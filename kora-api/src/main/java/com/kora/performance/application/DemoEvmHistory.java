package com.kora.performance.application;

import com.kora.organization.OrganizationTimeZone;
import com.kora.performance.domain.EarnedValueAnalysis;
import com.kora.performance.domain.EvmSnapshot;
import com.kora.platform.demo.DemoHistory;
import com.kora.platform.money.Money;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectQueries.ProjectKey;
import com.kora.portfolio.ProjectSnapshotSource;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Demo data (feature 22): the weekly EVM snapshots of the weeks before the demo existed, so the S-curve and the
 * dashboard trends have a history. PV and AC are the real figures as of each week (from the plan and the approved
 * timesheets); EV was never measured then, so it follows PV at today's schedule performance.
 */
@Component
@Profile("demo")
class DemoEvmHistory implements DemoHistory {

    private static final Set<String> STARTED = Set.of("IN_PROGRESS", "ON_HOLD", "CLOSING", "CLOSED");
    private static final BigDecimal TYPICAL_SPI = new BigDecimal("0.95");
    private static final int MAX_WEEKS = 52;

    private final EvmService evm;
    private final EvmSnapshotRepository snapshots;
    private final ProjectQueries projects;
    private final OrganizationTimeZone timeZone;
    private final TenantTransactions transactions;

    DemoEvmHistory(
            EvmService evm,
            EvmSnapshotRepository snapshots,
            ProjectQueries projects,
            OrganizationTimeZone timeZone,
            TenantTransactions transactions) {
        this.evm = evm;
        this.snapshots = snapshots;
        this.projects = projects;
        this.timeZone = timeZone;
        this.transactions = transactions;
    }

    @Override
    public void backfill(UUID organizationId, LocalDate today) {
        transactions.inOrganization(organizationId, () -> {
            for (ProjectKey key : projects.allProjects()) {
                if (key.organizationId().equals(organizationId)) {
                    projects.snapshotSource(key.projectId())
                            .filter(source -> STARTED.contains(source.status()))
                            .ifPresent(source -> draw(organizationId, source, today));
                }
            }
            return null;
        });
    }

    private void draw(UUID organizationId, ProjectSnapshotSource project, LocalDate today) {
        EvmService.Report now = evm.analyse(project.projectId(), today);
        BigDecimal spi = now.analysis().spi() != null ? now.analysis().spi() : TYPICAL_SPI;
        LocalDate thisWeek = mondayOf(today);
        LocalDate first = mondayOf(project.startDate());
        if (first.isBefore(thisWeek.minusWeeks(MAX_WEEKS))) {
            first = thisWeek.minusWeeks(MAX_WEEKS);
        }
        for (LocalDate monday = first; monday.isBefore(thisWeek); monday = monday.plusWeeks(1)) {
            if (snapshots
                    .findByProjectIdAndWeekStart(project.projectId(), monday)
                    .isPresent()) {
                continue;
            }
            LocalDate sunday = monday.plusDays(6);
            EarnedValueAnalysis then = evm.analyse(project.projectId(), sunday).analysis();
            Money earned = then.pv().times(spi);
            if (earned.amount().compareTo(then.bac().amount()) > 0) {
                earned = then.bac();
            }
            EvmSnapshot snapshot = EvmSnapshot.of(organizationId, project.projectId(), monday);
            snapshot.record(
                    EarnedValueAnalysis.of(
                            then.bac(),
                            then.pv(),
                            earned,
                            null,
                            then.ac(),
                            now.settings().getEacMethod()),
                    sunday.atTime(18, 0).atZone(timeZone.zone()).toInstant());
            snapshots.save(snapshot);
        }
    }

    private static LocalDate mondayOf(LocalDate day) {
        return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }
}
