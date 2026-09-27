package com.kora.resourcing.application;

import com.kora.resourcing.ActualCosts;
import com.kora.resourcing.domain.CostLedger;
import com.kora.resourcing.domain.TimeEntry;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ActualCostsService implements ActualCosts {

    private final TimeEntryRepository entries;
    private final CostRateRepository rates;

    ActualCostsService(TimeEntryRepository entries, CostRateRepository rates) {
        this.entries = entries;
        this.rates = rates;
    }

    @Override
    @Transactional(readOnly = true)
    public Ledger ledger(UUID projectId, String currency) {
        List<TimeEntry> approved = entries.findApproved(projectId);
        CostLedger.Costing costing = CostLedger.cost(
                approved,
                rates.findByUserIdIn(
                        approved.stream().map(TimeEntry::getUserId).distinct().toList()),
                currency);
        return Ledger.of(costing.costByDay(), costing.unratedHours(), currency);
    }
}
