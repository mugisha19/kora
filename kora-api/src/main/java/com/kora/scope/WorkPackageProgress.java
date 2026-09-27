package com.kora.scope;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * Progress measured from tasks (feature 08), implemented by the work module. Scope defines the port so the WBS can
 * roll up task progress without depending on the module that owns tasks.
 */
public interface WorkPackageProgress {

    /** Percent complete (0–100) of each work package in the project that has at least one task. */
    Map<UUID, BigDecimal> byWorkPackage(UUID projectId);
}
