package com.kora.reporting.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationCurrency;
import com.kora.platform.money.Money;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.Health;
import com.kora.portfolio.ProjectAccess;
import com.kora.reporting.application.SnapshotRepository.SnapshotFilter;
import com.kora.reporting.domain.ProjectSnapshot;
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

    DashboardService(SnapshotRepository snapshots, ProjectAccess projects, OrganizationCurrency currency) {
        this.snapshots = snapshots;
        this.projects = projects;
        this.currency = currency;
    }

    public record Summary(
            int projectCount,
            Map<String, Integer> byStatus,
            Map<Health, Integer> byHealth,
            Money totalBudget,
            Money totalPlannedCost,
            Money totalEarnedValue,
            int lateProjects) {}

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
        int late = 0;
        for (ProjectSnapshot row : rows) {
            byStatus.merge(row.getStatus(), 1, Integer::sum);
            byHealth.merge(row.getHealth(), 1, Integer::sum);
            if (row.getBudget() != null) {
                budget = budget.plus(row.getBudget());
            }
            plannedCost = plannedCost.plus(row.getPlannedCost());
            earnedValue = earnedValue.plus(row.getEarnedValue());
            late += row.isLate() ? 1 : 0;
        }
        return new Summary(rows.size(), byStatus, byHealth, budget, plannedCost, earnedValue, late);
    }

    @Transactional(readOnly = true)
    public Page<ProjectSnapshot> projects(UUID portfolioId, Health health, Pageable pageable) {
        CurrentMember.get();
        return snapshots.search(new SnapshotFilter(projects.visibility(), portfolioId, health), SORT.apply(pageable));
    }
}
