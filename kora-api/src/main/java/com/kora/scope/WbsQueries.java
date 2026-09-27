package com.kora.scope;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Read access for other modules (the dashboard read model). No access check: callers work in the tenant scope. */
public interface WbsQueries {

    /**
     * @param currency used when the project has no WBS yet, so empty totals are still in the organization's currency
     */
    WbsTotals totals(UUID projectId, String currency);

    /** Whether the node is a work package of the project: the only nodes tasks can be planned under. */
    boolean isWorkPackage(UUID projectId, UUID nodeId);

    /** Every work package with its planned cost and percent complete (from tasks where it has them). */
    List<WorkPackageFigures> workPackages(UUID projectId, String currency);

    record WorkPackageFigures(UUID nodeId, Money plannedCost, BigDecimal percentComplete) {}
}
