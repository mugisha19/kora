package com.kora.portfolio;

import java.util.Set;
import java.util.UUID;

/**
 * Which projects the caller may see: all of them ({@code PMO}, {@code ORG_ADMIN}) or only those they manage or are
 * members of. Read models (the dashboard) filter with it, so they show exactly what the project list shows.
 */
public record ProjectVisibility(boolean all, Set<UUID> projectIds) {

    public ProjectVisibility {
        projectIds = Set.copyOf(projectIds);
    }

    public static ProjectVisibility everything() {
        return new ProjectVisibility(true, Set.of());
    }

    public boolean includes(UUID projectId) {
        return all || projectIds.contains(projectId);
    }
}
