package com.kora.reporting.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationCurrency;
import com.kora.organization.OrganizationTimeZone;
import com.kora.performance.EvmQueries;
import com.kora.platform.money.Money;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.Health;
import com.kora.portfolio.ProjectAccess;
import com.kora.reporting.application.SnapshotRepository.SnapshotFilter;
import com.kora.reporting.domain.ProjectSnapshot;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The portfolio dashboard (feature 05), served from the snapshot read model and limited to exactly the projects the
 * caller may see in the project list.
 */
@Service
public class DashboardService {

    /** Default "needs attention" order: red first, then amber, grey, green; by name within each. */
    static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by("severity", "name"))
            .allow("code")
            .allow("name")
            .allow("percentComplete")
            .allow("targetEndDate");

    private final SnapshotRepository snapshots;
    private final ProjectAccess projects;
    private final OrganizationCurrency currency;
    private final EvmQueries evm;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    DashboardService(
            SnapshotRepository snapshots,
            ProjectAccess projects,
            OrganizationCurrency currency,
            EvmQueries evm,
            OrganizationTimeZone timeZone,
            Clock clock) {
        this.snapshots = snapshots;
        this.projects = projects;
        this.currency = currency;
        this.evm = evm;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    /** A month of portfolio figures; the indices are null where they would divide by zero. */
    public record TrendMonth(YearMonth month, Money pv, Money ev, Money ac, BigDecimal spi, BigDecimal cpi) {}

    public record Summary(
            int projectCount,
            Map<String, Integer> byStatus,
            Map<Health, Integer> byHealth,
            Money totalBudget,
            Money totalPlannedCost,
            Money totalEarnedValue,
            Money totalActualCost,
            int lateProjects,
            BigDecimal portfolioSpi,
            BigDecimal portfolioCpi,
            int openCriticalRisks,
            int pendingChangeRequests) {}

    @Transactional(readOnly = true)
    public Summary summary(UUID portfolioId) {
        CurrentMember.get();
        List<ProjectSnapshot> rows = snapshots.search(new SnapshotFilter(projects.visibility(), portfolioId, null));
        String organizationCurrency = currency.current();
        Map<String, Integer> byStatus = new TreeMap<>();
        Map<Health, Integer> byHealth = new EnumMap<>(Health.class);
        Money budget = Money.zero(organizationCurrency);
        Money plannedCost = Money.zero(organizationCurrency);
        Money earnedValue = Money.zero(organizationCurrency);
        Money actualCost = Money.zero(organizationCurrency);
        Money plannedValue = Money.zero(organizationCurrency);
        Money evmEarned = Money.zero(organizationCurrency);
        int late = 0;
        int criticalRisks = 0;
        int pendingChanges = 0;
        for (ProjectSnapshot row : rows) {
            if (row.getPlannedValue() != null) {
                plannedValue = plannedValue.plus(row.getPlannedValue());
            }
            if (row.getEvmEarnedValue() != null) {
                evmEarned = evmEarned.plus(row.getEvmEarnedValue());
            }
            if (row.getActualCost() != null) {
                actualCost = actualCost.plus(row.getActualCost());
            }
            criticalRisks += row.getOpenCriticalRisks();
            pendingChanges += row.getPendingChangeRequests();
            byStatus.merge(row.getStatus(), 1, Integer::sum);
            byHealth.merge(row.getHealth(), 1, Integer::sum);
            if (row.getBudget() != null) {
                budget = budget.plus(row.getBudget());
            }
            plannedCost = plannedCost.plus(row.getPlannedCost());
            earnedValue = earnedValue.plus(row.getEarnedValue());
            late += row.isLate() ? 1 : 0;
        }
        return new Summary(
                rows.size(),
                byStatus,
                byHealth,
                budget,
                plannedCost,
                earnedValue,
                actualCost,
                late,
                ratio(evmEarned, plannedValue),
                ratio(evmEarned, actualCost),
                criticalRisks,
                pendingChanges);
    }

    /** Portfolio PV, EV, AC and indices per month, from the weekly EVM snapshots of the visible projects. */
    @Transactional(readOnly = true)
    public List<TrendMonth> trends(int months, UUID portfolioId) {
        CurrentMember.get();
        List<UUID> visible = snapshots.search(new SnapshotFilter(projects.visibility(), portfolioId, null)).stream()
                .map(ProjectSnapshot::getProjectId)
                .toList();
        return evm.monthly(visible, months, LocalDate.now(clock.withZone(timeZone.zone())), currency.current()).stream()
                .map(month -> new TrendMonth(
                        month.month(),
                        month.pv(),
                        month.ev(),
                        month.ac(),
                        ratio(month.ev(), month.pv()),
                        ratio(month.ev(), month.ac())))
                .toList();
    }

    /** Σ EV ÷ Σ PV (or Σ AC): the portfolio index weighs projects by their size, not one project, one vote. */
    private static BigDecimal ratio(Money numerator, Money denominator) {
        if (denominator.isZero()) {
            return null;
        }
        return numerator.amount().divide(denominator.amount(), 2, RoundingMode.HALF_EVEN);
    }

    @Transactional(readOnly = true)
    public Page<ProjectSnapshot> projects(UUID portfolioId, Health health, Pageable pageable) {
        CurrentMember.get();
        return snapshots.search(new SnapshotFilter(projects.visibility(), portfolioId, health), SORT.apply(pageable));
    }
}
