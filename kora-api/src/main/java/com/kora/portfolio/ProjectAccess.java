package com.kora.portfolio;

import java.util.UUID;

/**
 * The one place that decides who may see and change a project, used by every module with project-scoped data
 * (charter, WBS, and later tasks, risks, timesheets...). Answers consistently:
 *
 * <ul>
 *   <li>a project the caller can't see is {@code 404}, as if it didn't exist;
 *   <li>a visible project the caller can't change is {@code 403 access.denied};
 *   <li>a project in an archived portfolio can't be changed: {@code 409 portfolios.archived}.
 * </ul>
 */
public interface ProjectAccess {

    ProjectRef readable(UUID projectId);

    /** The project manager, {@code PMO} or {@code ORG_ADMIN}, and only while its portfolio is active. */
    ProjectRef manageable(UUID projectId);

    /**
     * Managers as in {@link #manageable}, plus the team's contributors (unless the organization only lets them read,
     * {@code VIEWER}), and only while its portfolio is active. Observers get {@code 403}.
     */
    ProjectParticipation participating(UUID projectId);

    /** Whether the user could be given work on the project: its manager or a contributor on its team. */
    boolean canWorkOn(UUID projectId, UUID userId);

    ProjectVisibility visibility();
}
