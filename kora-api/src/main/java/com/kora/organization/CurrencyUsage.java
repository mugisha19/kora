package com.kora.organization;

/**
 * Implemented by modules that store amounts in the organization's currency (budgets, costs). While any of them holds
 * an amount, the currency can't change: 1,000,000 RWF silently becoming 1,000,000 USD would be a very expensive
 * rename. A port owned here and implemented elsewhere, so this module never depends on the modules that use it.
 */
public interface CurrencyUsage {

    /** Whether the active organization has any amount in its current currency. */
    boolean currencyInUse();
}
