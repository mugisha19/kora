import {
  canCreateProject,
  canDecideCharter,
  canEditProject,
  canManagePortfolios,
  canManageProjects,
  governs,
} from './permissions';

describe('permissions', () => {
  const project = { manager: { userId: 'pm-1', fullName: 'Grace' } };
  const charter = { sponsor: { userId: 'sponsor-1', fullName: 'Jean-Paul' } };

  it('lets PMO and admins govern portfolios', () => {
    expect(governs('PMO')).toBe(true);
    expect(governs('ORG_ADMIN')).toBe(true);
    expect(governs('PROJECT_MANAGER')).toBe(false);
    expect(governs(null)).toBe(false);
    expect(canManagePortfolios('PROJECT_MANAGER')).toBe(false);
  });

  it('lets project managers and governors create and manage projects', () => {
    expect(canCreateProject('PROJECT_MANAGER')).toBe(true);
    expect(canCreateProject('MEMBER')).toBe(false);
    expect(canCreateProject('VIEWER')).toBe(false);
    expect(canManageProjects('PMO')).toBe(true);
    expect(canManageProjects('MEMBER')).toBe(false);
  });

  it("lets only the project's manager, PMO or an admin edit it", () => {
    expect(canEditProject(project, 'pm-1', 'PROJECT_MANAGER')).toBe(true);
    expect(canEditProject(project, 'pm-2', 'PROJECT_MANAGER')).toBe(false);
    expect(canEditProject(project, 'x', 'PMO')).toBe(true);
    expect(canEditProject(project, 'pm-1', 'VIEWER')).toBe(true); // role changed, still the manager
    expect(canEditProject(null, 'pm-1', 'ORG_ADMIN')).toBe(false);
  });

  it('lets the sponsor, PMO or an admin decide on a charter', () => {
    expect(canDecideCharter(charter, 'sponsor-1', 'MEMBER')).toBe(true);
    expect(canDecideCharter(charter, 'pm-1', 'PROJECT_MANAGER')).toBe(false);
    expect(canDecideCharter({}, 'pm-1', 'ORG_ADMIN')).toBe(true);
    expect(canDecideCharter({}, 'pm-1', 'PROJECT_MANAGER')).toBe(false);
  });
});
