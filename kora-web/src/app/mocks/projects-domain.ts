import {
  Charter,
  DashboardProject,
  DashboardSummary,
  Health,
  Portfolio,
  Program,
  Project,
  ProjectMember,
  ProjectStatus,
  Role,
  UserRef,
  WbsNode,
  WbsTree,
} from '../core/api/api.models';
import {
  CharterRecord,
  PortfolioRecord,
  ProgramRecord,
  ProjectRecord,
  WbsNodeRecord,
} from './data-projects';
import { MembershipRecord } from './data';
import { db, must } from './db';
import { currencyDigits, fromUnits, percentOf, toUnits } from './decimal';

/*
 * The project domain as the API implements it (contract 0.2.0 + backend notes), for the mock:
 * lifecycle state machine, health rule, visibility and edit rights, WBS roll-ups, dashboard.
 */

// ---------- People and organizations ----------

export function userRef(userId: string): UserRef {
  return { userId, fullName: db.user(userId)?.fullName ?? '' };
}

export function orgCurrency(organizationId: string): string {
  return db.organization(organizationId)?.currency ?? 'RWF';
}

/** Today as YYYY-MM-DD in the organization's time zone (lateness uses the org's calendar). */
export function orgToday(organizationId: string, now = Date.now()): string {
  const timeZone = db.organization(organizationId)?.timeZone ?? 'Africa/Kigali';
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(now));
}

export function governs(role: Role): boolean {
  return role === 'PMO' || role === 'ORG_ADMIN';
}

// ---------- Lifecycle (State pattern on the API side) ----------

/** Where each status may go next through POST /transitions. PROPOSED→APPROVED is the charter's job. */
export const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PROPOSED: ['CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'CLOSING', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  CLOSING: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

// ---------- Health rule (ADR 0008 on the API side) ----------

const NOT_ACTIVE: ProjectStatus[] = ['PROPOSED', 'APPROVED', 'CLOSED', 'CANCELLED'];
const RUNNING: ProjectStatus[] = ['IN_PROGRESS', 'ON_HOLD', 'CLOSING'];

export function isLate(project: ProjectRecord, now = Date.now()): boolean {
  return (
    RUNNING.includes(project.status) &&
    orgToday(project.organizationId, now) > project.targetEndDate
  );
}

export function health(
  project: ProjectRecord,
  now = Date.now(),
): {
  health: Health;
  healthReason?: string;
  healthOverridden: boolean;
} {
  if (project.healthOverride) {
    return {
      ...project.healthOverride,
      healthReason: project.healthOverride.reason,
      healthOverridden: true,
    };
  }
  // Reasons are the API's English text (HealthRule); the UI shows them as sent.
  if (NOT_ACTIVE.includes(project.status)) {
    const reason =
      project.status === 'CLOSED'
        ? 'Closed'
        : project.status === 'CANCELLED'
          ? 'Cancelled'
          : 'Not started';
    return { health: 'GREY', healthReason: reason, healthOverridden: false };
  }
  if (isLate(project, now)) {
    return {
      health: 'AMBER',
      healthReason: `Past its target end date (${project.targetEndDate})`,
      healthOverridden: false,
    };
  }
  return { health: 'GREEN', healthReason: 'On track', healthOverridden: false };
}

// ---------- Visibility and rights ----------

export function isProjectMember(project: ProjectRecord, userId: string): boolean {
  return (
    project.managerId === userId ||
    db.state.projectMembers.some((m) => m.projectId === project.id && m.userId === userId)
  );
}

/** PMO/ORG_ADMIN see every project; others only projects they manage or belong to. */
export function canSee(project: ProjectRecord, membership: MembershipRecord): boolean {
  return (
    project.organizationId === membership.organizationId &&
    (governs(membership.role) || isProjectMember(project, membership.userId))
  );
}

export function canEdit(project: ProjectRecord, membership: MembershipRecord): boolean {
  return governs(membership.role) || project.managerId === membership.userId;
}

export function visibleProjects(membership: MembershipRecord): ProjectRecord[] {
  return db.state.projects.filter((p) => canSee(p, membership));
}

// ---------- Views ----------

export function toPortfolio(record: PortfolioRecord): Portfolio {
  return {
    id: record.id,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    strategicObjectives: record.strategicObjectives,
    owner: userRef(record.ownerId),
    status: record.status,
    programCount: db.state.programs.filter((p) => p.portfolioId === record.id).length,
    projectCount: db.state.projects.filter((p) => p.portfolioId === record.id).length,
    createdAt: record.createdAt,
    version: record.version,
  };
}

export function toProgram(record: ProgramRecord): Program {
  return {
    id: record.id,
    portfolioId: record.portfolioId,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    manager: userRef(record.managerId),
    status: record.status,
    projectCount: db.state.projects.filter((p) => p.programId === record.id).length,
    createdAt: record.createdAt,
    version: record.version,
  };
}

export function toProject(record: ProjectRecord): Project {
  const { health: value, healthReason, healthOverridden } = health(record);
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    portfolioId: record.portfolioId,
    ...(record.programId ? { programId: record.programId } : {}),
    manager: userRef(record.managerId),
    methodology: record.methodology,
    status: record.status,
    allowedTransitions: TRANSITIONS[record.status],
    startDate: record.startDate,
    targetEndDate: record.targetEndDate,
    ...(record.budget ? { budget: record.budget } : {}),
    health: value,
    ...(healthReason ? { healthReason } : {}),
    healthOverridden,
    createdAt: record.createdAt,
    version: record.version,
  };
}

export function projectMembers(project: ProjectRecord): ProjectMember[] {
  const manager = must(db.user(project.managerId), 'manager');
  const others = db.state.projectMembers
    .filter((m) => m.projectId === project.id && m.userId !== project.managerId)
    .map((m) => {
      const user = must(db.user(m.userId), 'member');
      return {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        projectRole: m.projectRole,
        addedAt: m.addedAt,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  return [
    {
      userId: manager.id,
      fullName: manager.fullName,
      email: manager.email,
      projectRole: 'MANAGER',
      addedAt: project.createdAt,
    },
    ...others,
  ];
}

export function toCharter(record: CharterRecord): Charter {
  return {
    projectId: record.projectId,
    versionNumber: record.versionNumber,
    status: record.status,
    ...(record.purpose ? { purpose: record.purpose } : {}),
    ...(record.businessCase ? { businessCase: record.businessCase } : {}),
    objectives: record.objectives,
    inScope: record.inScope,
    outOfScope: record.outOfScope,
    assumptions: record.assumptions,
    constraints: record.constraints,
    highLevelRisks: record.highLevelRisks,
    milestones: record.milestones,
    ...(record.summaryBudget ? { summaryBudget: record.summaryBudget } : {}),
    ...(record.sponsorId ? { sponsor: userRef(record.sponsorId) } : {}),
    ...(record.submittedAt ? { submittedAt: record.submittedAt } : {}),
    ...(record.approvedById ? { approvedBy: userRef(record.approvedById) } : {}),
    ...(record.approvedAt ? { approvedAt: record.approvedAt } : {}),
    ...(record.returnComment ? { returnComment: record.returnComment } : {}),
    version: record.version,
  };
}

/** The charter that isn't superseded: the latest version. */
export function currentCharter(projectId: string): CharterRecord | undefined {
  return db.state.charters
    .filter((c) => c.projectId === projectId && c.status !== 'SUPERSEDED')
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

// ---------- WBS (Composite on the API side) ----------

interface Rolled {
  node: WbsNode;
  effort: number;
  cost: bigint;
  earned: bigint;
  percent: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function childrenOf(projectId: string, parentId: string | undefined): WbsNodeRecord[] {
  return db.state.wbsNodes
    .filter((n) => n.projectId === projectId && n.parentId === parentId)
    .sort((a, b) => a.position - b.position);
}

/** Effort-weighted progress; a plain average when nothing has effort; 0 for no children. */
function rollProgress(children: readonly Rolled[]): number {
  const effort = children.reduce((total, c) => total + c.effort, 0);
  if (effort > 0) {
    return round2(children.reduce((total, c) => total + c.percent * c.effort, 0) / effort);
  }
  return children.length
    ? round2(children.reduce((t, c) => t + c.percent, 0) / children.length)
    : 0;
}

function roll(record: WbsNodeRecord, code: string, currency: string): Rolled {
  const digits = currencyDigits(currency);
  const money = (units: bigint) => ({ amount: fromUnits(units, digits), currency });
  const base = {
    id: record.id,
    ...(record.parentId ? { parentId: record.parentId } : {}),
    code,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    type: record.type,
    ...(record.ownerId ? { owner: userRef(record.ownerId) } : {}),
    version: record.version,
  };

  if (record.type === 'WORK_PACKAGE') {
    const cost = toUnits(record.plannedCost);
    const earned = percentOf(record.plannedCost, record.percentComplete);
    return {
      node: {
        ...base,
        plannedEffortHours: record.plannedEffortHours,
        plannedCost: money(cost),
        percentComplete: record.percentComplete,
        percentCompleteSource: 'REPORTED',
        earnedValue: money(earned),
        children: [],
      },
      effort: record.plannedEffortHours,
      cost,
      earned,
      percent: record.percentComplete,
    };
  }

  const children = childrenOf(record.projectId, record.id).map((child, index) =>
    roll(child, `${code}.${index + 1}`, currency),
  );
  const effort = round2(children.reduce((total, c) => total + c.effort, 0));
  const cost = children.reduce((total, c) => total + c.cost, 0n);
  const earned = children.reduce((total, c) => total + c.earned, 0n);
  const percent = rollProgress(children);
  return {
    node: {
      ...base,
      plannedEffortHours: effort,
      plannedCost: money(cost),
      percentComplete: percent,
      percentCompleteSource: 'ROLLED_UP',
      earnedValue: money(earned),
      children: children.map((c) => c.node),
    },
    effort,
    cost,
    earned,
    percent,
  };
}

export function wbsTree(project: ProjectRecord): WbsTree {
  const currency = orgCurrency(project.organizationId);
  const digits = currencyDigits(currency);
  const top = childrenOf(project.id, undefined).map((n, i) => roll(n, String(i + 1), currency));
  const money = (units: bigint) => ({ amount: fromUnits(units, digits), currency });
  return {
    projectId: project.id,
    plannedEffortHours: round2(top.reduce((t, n) => t + n.effort, 0)),
    plannedCost: money(top.reduce((t, n) => t + n.cost, 0n)),
    percentComplete: rollProgress(top),
    earnedValue: money(top.reduce((t, n) => t + n.earned, 0n)),
    nodes: top.map((n) => n.node),
  };
}

/** A node as the API returns it from PATCH/POST: its subtree rolled up, with its current code. */
export function wbsNodeView(record: WbsNodeRecord): WbsNode {
  const find = (nodes: WbsNode[]): WbsNode | undefined => {
    for (const node of nodes) {
      if (node.id === record.id) return node;
      const inner = find(node.children);
      if (inner) return inner;
    }
    return undefined;
  };
  const project = must(
    db.state.projects.find((p) => p.id === record.projectId),
    'project',
  );
  return must(find(wbsTree(project).nodes), 'wbs node');
}

export function depthOf(nodeId: string | undefined): number {
  let depth = 0;
  let current = nodeId;
  while (current) {
    depth += 1;
    current = db.state.wbsNodes.find((n) => n.id === current)?.parentId;
  }
  return depth;
}

export function subtreeHeight(nodeId: string): number {
  const node = must(
    db.state.wbsNodes.find((n) => n.id === nodeId),
    'wbs node',
  );
  const kids = childrenOf(node.projectId, node.id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => subtreeHeight(k.id))) : 0);
}

export function isDescendant(candidateId: string, ancestorId: string): boolean {
  let current = db.state.wbsNodes.find((n) => n.id === candidateId)?.parentId;
  while (current) {
    if (current === ancestorId) return true;
    current = db.state.wbsNodes.find((n) => n.id === current)?.parentId;
  }
  return false;
}

/** Renumbers positions 0..n-1 among siblings after an insert, move or delete. */
export function compactPositions(projectId: string, parentId: string | undefined): void {
  childrenOf(projectId, parentId).forEach((node, index) => (node.position = index));
}

// ---------- Dashboard (read model on the API side) ----------

const SEVERITY: Record<Health, number> = { RED: 0, AMBER: 1, GREY: 2, GREEN: 3 };

export function dashboardRow(project: ProjectRecord, today: string): DashboardProject {
  const view = toProject(project);
  const next = currentCharter(project.id)
    ?.milestones.filter((m) => m.targetDate >= today)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
  return {
    projectId: project.id,
    code: project.code,
    name: project.name,
    portfolioId: project.portfolioId,
    manager: view.manager,
    status: project.status,
    health: view.health,
    ...(view.healthReason ? { healthReason: view.healthReason } : {}),
    healthOverridden: view.healthOverridden,
    percentComplete: wbsTree(project).percentComplete,
    targetEndDate: project.targetEndDate,
    ...(next ? { nextMilestone: next } : {}),
  };
}

export function severity(health: Health): number {
  return SEVERITY[health];
}

export function dashboardSummary(
  projects: readonly ProjectRecord[],
  organizationId: string,
): DashboardSummary {
  const currency = orgCurrency(organizationId);
  const digits = currencyDigits(currency);
  const count = <K extends string>(values: K[]) =>
    values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  const trees = projects.map((p) => wbsTree(p));
  const money = (units: bigint) => ({ amount: fromUnits(units, digits), currency });
  return {
    projectCount: projects.length,
    byStatus: count(projects.map((p) => p.status)),
    byHealth: count(projects.map((p) => toProject(p).health)),
    totalBudget: money(
      projects.reduce((t, p) => t + (p.budget ? toUnits(p.budget.amount) : 0n), 0n),
    ),
    totalPlannedCost: money(trees.reduce((t, tree) => t + toUnits(tree.plannedCost.amount), 0n)),
    totalEarnedValue: money(trees.reduce((t, tree) => t + toUnits(tree.earnedValue.amount), 0n)),
    lateProjects: projects.filter((p) => isLate(p)).length,
  };
}
