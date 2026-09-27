package com.kora.performance.application;

import com.kora.performance.EvmQueries;
import com.kora.performance.domain.EarnedValueAnalysis;
import com.kora.performance.domain.EvmSnapshot;
import com.kora.platform.money.Money;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class EvmQueriesService implements EvmQueries {

    private final EvmService evm;
    private final EvmSnapshotRepository snapshots;

    EvmQueriesService(EvmService evm, EvmSnapshotRepository snapshots) {
        this.evm = evm;
        this.snapshots = snapshots;
    }

    @Override
    @Transactional(readOnly = true)
    public Figures current(UUID projectId) {
        EarnedValueAnalysis analysis = evm.analyse(projectId, evm.today()).analysis();
        return new Figures(analysis.pv(), analysis.ev(), analysis.ac(), analysis.spi(), analysis.cpi());
    }

    @Override
    @Transactional(readOnly = true)
    public List<Month> monthly(Collection<UUID> projectIds, int months, LocalDate today, String currency) {
        YearMonth last = YearMonth.from(today);
        YearMonth first = last.minusMonths(months - 1L);
        List<EvmSnapshot> history = projectIds.isEmpty()
                ? List.of()
                : snapshots.findByProjectIdInAndWeekStartLessThanEqualOrderByWeekStartAsc(
                        projectIds, last.atEndOfMonth());
        List<Month> result = new ArrayList<>();
        for (YearMonth month = first; !month.isAfter(last); month = month.plusMonths(1)) {
            LocalDate end = month.atEndOfMonth();
            // Snapshots are cumulative: a project's latest one up to the month's end stands for the month.
            Map<UUID, EvmSnapshot> latest = new HashMap<>();
            for (EvmSnapshot snapshot : history) {
                if (!snapshot.getWeekStart().isAfter(end)) {
                    latest.put(snapshot.getProjectId(), snapshot);
                }
            }
            Money pv = Money.zero(currency);
            Money ev = Money.zero(currency);
            Money ac = Money.zero(currency);
            for (EvmSnapshot snapshot : latest.values()) {
                pv = pv.plus(snapshot.pv());
                ev = snapshot.ev() == null ? ev : ev.plus(snapshot.ev());
                ac = ac.plus(snapshot.ac());
            }
            result.add(new Month(month, pv, ev, ac));
        }
        return result;
    }
}
