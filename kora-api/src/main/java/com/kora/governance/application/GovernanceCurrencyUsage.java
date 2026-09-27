package com.kora.governance.application;

import com.kora.organization.CurrencyUsage;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Change requests carry cost changes in the organization's currency, so it can't change once one exists. */
@Component
class GovernanceCurrencyUsage implements CurrencyUsage {

    private final ChangeRequestRepository requests;

    GovernanceCurrencyUsage(ChangeRequestRepository requests) {
        this.requests = requests;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean currencyInUse() {
        return requests.existsByCostDeltaAmountIsNotNull();
    }
}
