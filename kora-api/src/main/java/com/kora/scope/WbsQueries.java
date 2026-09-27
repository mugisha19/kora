package com.kora.scope;

import java.util.UUID;

/** Read access for other modules (the dashboard read model). No access check: callers work in the tenant scope. */
public interface WbsQueries {

    /**
     * @param currency used when the project has no WBS yet, so empty totals are still in the organization's currency
     */
    WbsTotals totals(UUID projectId, String currency);

    /** Whether the node is a work package of the project: the only nodes tasks can be planned under. */
    boolean isWorkPackage(UUID projectId, UUID nodeId);
}
