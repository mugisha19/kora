package com.kora.organization;

/**
 * A member's role in one organization (RBAC, feature 03). The UI hides what a role can't do; the API enforces it in
 * each use case with {@link CurrentMember#requireRole}.
 */
public enum Role {
    /** Everything, including members, roles, invitations and organization settings. */
    ORG_ADMIN,
    /** Governs portfolios and programs, approves change requests, sees all projects. */
    PMO,
    /** Creates and runs projects, plans schedules, manages risks and issues. */
    PROJECT_MANAGER,
    /** Works on assigned tasks, logs time, comments. */
    MEMBER,
    /** Reads only. */
    VIEWER
}
