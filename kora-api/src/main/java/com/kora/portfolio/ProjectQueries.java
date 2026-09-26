package com.kora.portfolio;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Read and write access for the reporting module's read model. No access checks: the reporting module already works
 * inside the caller's tenant scope and filters by {@link ProjectVisibility} itself.
 */
public interface ProjectQueries {

    Optional<ProjectSnapshotSource> snapshotSource(UUID projectId);

    /** Every project of every organization, for the periodic refresh. Call in the system scope. */
    List<ProjectKey> allProjects();

    /**
     * Stores the health computed by the dashboard rule. Publishes {@link ProjectHealthChanged} when the effective
     * health changes, i.e. not while an override hides the computed value.
     */
    void recordComputedHealth(UUID projectId, Health health, String reason);

    record ProjectKey(UUID organizationId, UUID projectId) {}
}
