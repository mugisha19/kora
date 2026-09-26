package com.kora.scope.application;

import com.kora.organization.CurrencyUsage;
import java.math.BigDecimal;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Planned costs of work packages are amounts in the organization's currency. */
@Component
class ScopeCurrencyUsage implements CurrencyUsage {

    private final WbsNodeRepository nodes;

    ScopeCurrencyUsage(WbsNodeRepository nodes) {
        this.nodes = nodes;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean currencyInUse() {
        return nodes.existsByPlannedCostAmountGreaterThan(BigDecimal.ZERO);
    }
}
