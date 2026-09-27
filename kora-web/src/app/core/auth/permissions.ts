import { Role, UserRef } from '../api/api.models';

/*
 * What the UI offers to whom (contract 0.2.0 rules). The API enforces the same rules on every call;
 * these only decide which buttons and pages to show.
 */

/** PMO and organization admins govern everything: portfolios, programs, all projects. */
export function governs(role: Role | null): boolean {
  return role === 'PMO' || role === 'ORG_ADMIN';
}

export function canManagePortfolios(role: Role | null): boolean {
  return governs(role);
}

/** Project managers can create projects (and must manage them); governors too. */
export function canCreateProject(role: Role | null): boolean {
  return role === 'PROJECT_MANAGER' || governs(role);
}

/** Roles that can be a project's or a program's manager. */
export const MANAGER_ROLES: readonly Role[] = ['PROJECT_MANAGER', 'PMO', 'ORG_ADMIN'];

export function canManageProjects(role: Role): boolean {
  return MANAGER_ROLES.includes(role);
}

/**
 * Update, transition, override health, edit the team, edit and submit the charter, edit the WBS:
 * the project's own manager, PMO or ORG_ADMIN.
 */
export function canEditProject(
  project: { manager: UserRef } | null | undefined,
  userId: string | undefined,
  role: Role | null,
): boolean {
  if (!project) return false;
  return governs(role) || (userId !== undefined && project.manager.userId === userId);
}

/** Approve or return a submitted charter: its sponsor, PMO or ORG_ADMIN. */
export function canDecideCharter(
  charter: { sponsor?: UserRef } | null | undefined,
  userId: string | undefined,
  role: Role | null,
): boolean {
  if (!charter) return false;
  return governs(role) || (userId !== undefined && charter.sponsor?.userId === userId);
}
