import {
  BOARD_STATUSES,
  Board,
  BoardColumn,
  BoardStatus,
  Burndown,
  Sprint,
  Task,
  TaskPriority,
  TaskStatus,
  Velocity,
} from '../core/api/api.models';
import { MembershipRecord } from './data';
import { ProjectRecord } from './data-projects';
import { SprintRecord, TaskRecord } from './data-work';
import { db } from './db';
import { canEdit, orgToday, userRef } from './projects-domain';

/*
 * The work domain as the API implements it (contract 0.3.0 + backend notes), for the mock: task
 * lifecycle, participation rights, project-wide ranks, the board, sprints, burndown, velocity and
 * the progress tasks give their work package.
 */

// ---------- Lifecycle (State pattern on the API side) ----------

const NEXT: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: ['TODO'],
  TODO: ['BACKLOG', 'IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['TODO', 'IN_REVIEW', 'BLOCKED'],
  BLOCKED: ['TODO', 'IN_PROGRESS'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: ['TODO'],
};

/** Staying in the same status is always allowed: it is a reorder. */
export function canMoveTask(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || NEXT[from].includes(to);
}

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const DEFAULT_COLUMN_NAMES: Record<BoardStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

// ---------- Who may do what ----------

/** Managers (the project's manager, PMO, ORG_ADMIN) do everything. */
export function manages(project: ProjectRecord, membership: MembershipRecord): boolean {
  return canEdit(project, membership);
}

/** Managers and the project's contributors create tasks and comment. */
export function participates(project: ProjectRecord, membership: MembershipRecord): boolean {
  return (
    manages(project, membership) ||
    db.state.projectMembers.some(
      (m) =>
        m.projectId === project.id &&
        m.userId === membership.userId &&
        m.projectRole === 'CONTRIBUTOR',
    )
  );
}

/** Contributors change tasks assigned to them or to nobody. */
export function canChangeTask(
  task: TaskRecord,
  project: ProjectRecord,
  membership: MembershipRecord,
): boolean {
  if (manages(project, membership)) return true;
  return (
    participates(project, membership) &&
    (task.assigneeId === undefined || task.assigneeId === membership.userId)
  );
}

/** Tasks can be assigned to the project's manager or a contributor on its team. */
export function canBeAssigned(project: ProjectRecord, userId: string): boolean {
  return (
    project.managerId === userId ||
    db.state.projectMembers.some(
      (m) => m.projectId === project.id && m.userId === userId && m.projectRole === 'CONTRIBUTOR',
    )
  );
}

// ---------- Views ----------

export function projectOf(task: TaskRecord): ProjectRecord {
  const project = db.state.projects.find((p) => p.id === task.projectId);
  if (!project) throw new Error(`No project for task ${task.id}`);
  return project;
}

export function toTask(record: TaskRecord): Task {
  const project = projectOf(record);
  return {
    id: record.id,
    key: `${project.code}-${record.number}`,
    projectId: record.projectId,
    title: record.title,
    ...(record.description ? { description: record.description } : {}),
    type: record.type,
    priority: record.priority,
    status: record.status,
    ...(record.blockedReason ? { blockedReason: record.blockedReason } : {}),
    ...(record.assigneeId ? { assignee: userRef(record.assigneeId) } : {}),
    ...(record.wbsNodeId ? { wbsNodeId: record.wbsNodeId } : {}),
    ...(record.sprintId ? { sprintId: record.sprintId } : {}),
    ...(record.storyPoints !== undefined ? { storyPoints: record.storyPoints } : {}),
    ...(record.estimateHours !== undefined ? { estimateHours: record.estimateHours } : {}),
    ...(record.remainingHours !== undefined ? { remainingHours: record.remainingHours } : {}),
    ...(record.startDate ? { startDate: record.startDate } : {}),
    ...(record.dueDate ? { dueDate: record.dueDate } : {}),
    labels: record.labels,
    rank: record.rank,
    createdAt: record.createdAt,
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    version: record.version,
  };
}

/** A project's tasks in rank order. */
export function tasksOf(projectId: string): TaskRecord[] {
  return db.state.tasks
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => a.rank.localeCompare(b.rank));
}

export function points(task: TaskRecord): number {
  return task.storyPoints ?? 0;
}

export function board(project: ProjectRecord, sprintId?: string): Board {
  const all = tasksOf(project.id);
  const columns: BoardColumn[] = BOARD_STATUSES.map((status) => {
    const settings = db.state.boardColumns.find(
      (c) => c.projectId === project.id && c.status === status,
    );
    // WIP counts are project-wide, whatever sprint the board shows.
    const count = all.filter((t) => t.status === status).length;
    const wipLimit = settings?.wipLimit;
    return {
      status,
      name: settings?.name ?? DEFAULT_COLUMN_NAMES[status],
      ...(wipLimit !== undefined ? { wipLimit } : {}),
      taskCount: count,
      atLimit: wipLimit !== undefined && count >= wipLimit,
      tasks: all
        .filter((t) => t.status === status && (!sprintId || t.sprintId === sprintId))
        .map(toTask),
    };
  });
  return { projectId: project.id, ...(sprintId ? { sprintId } : {}), columns };
}

/** Unfinished tasks in no sprint, in rank order. */
export function backlogOf(projectId: string): TaskRecord[] {
  return tasksOf(projectId).filter((t) => !t.sprintId && t.status !== 'DONE');
}

export function toSprint(record: SprintRecord): Sprint {
  const inSprint = db.state.tasks.filter((t) => t.sprintId === record.id);
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    ...(record.goal ? { goal: record.goal } : {}),
    startDate: record.startDate,
    endDate: record.endDate,
    status: record.status,
    taskCount: inSprint.length,
    totalPoints: inSprint.reduce((total, t) => total + points(t), 0),
    ...(record.committedPoints !== undefined ? { committedPoints: record.committedPoints } : {}),
    ...(record.completedPoints !== undefined ? { completedPoints: record.completedPoints } : {}),
    version: record.version,
  };
}

// ---------- Ranks ----------

const WIDTH = 15;
const GAP = 1_000_000;
const format = (n: number) => String(n).padStart(WIDTH, '0');

/** Renumbers a project's ranks with even gaps (keeps the order). */
function rebalance(projectId: string): void {
  tasksOf(projectId).forEach((task, index) => (task.rank = format((index + 1) * GAP)));
}

/**
 * A rank between `lower` and `upper` (either may be absent: first or last). Ranks are
 * project-wide, so a column's order is the rank order of its tasks.
 */
export function rankBetween(
  projectId: string,
  lower: TaskRecord | undefined,
  upper: TaskRecord | undefined,
): string {
  const low = lower ? Number(lower.rank) : 0;
  const high = upper ? Number(upper.rank) : low + 2 * GAP;
  const middle = Math.floor((low + high) / 2);
  if (middle > low && middle < high) return format(middle);
  rebalance(projectId);
  return rankBetween(projectId, lower, upper);
}

// ---------- Burndown and velocity ----------

/** Records the active sprint's remaining points for today (after any task change). */
export function recordBurndown(projectId: string): void {
  const sprint = db.state.sprints.find((s) => s.projectId === projectId && s.status === 'ACTIVE');
  if (sprint) recordSprintDay(sprint, projectId);
}

export function recordSprintDay(sprint: SprintRecord, projectId: string): void {
  const remaining = db.state.tasks
    .filter((t) => t.sprintId === sprint.id && t.status !== 'DONE')
    .reduce((total, t) => total + points(t), 0);
  const project = db.state.projects.find((p) => p.id === projectId);
  if (!project) return;
  const today = orgToday(project.organizationId);
  const existing = db.state.sprintDays.find((d) => d.sprintId === sprint.id && d.date === today);
  if (existing) existing.remainingPoints = remaining;
  else db.state.sprintDays.push({ sprintId: sprint.id, date: today, remainingPoints: remaining });
}

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Ideal line from the commitment to 0 on the last day; actual from the daily records. */
export function burndown(sprint: SprintRecord, today: string): Burndown {
  const committed =
    sprint.committedPoints ??
    db.state.tasks.filter((t) => t.sprintId === sprint.id).reduce((t, x) => t + points(x), 0);
  const length =
    Math.round((Date.parse(sprint.endDate) - Date.parse(sprint.startDate)) / 86_400_000) + 1;
  const steps = Math.max(length - 1, 1);
  const recorded = db.state.sprintDays
    .filter((d) => d.sprintId === sprint.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const days = Array.from({ length }, (_, i) => {
    const date = addDays(sprint.startDate, i);
    const ideal = Math.round(((committed * Math.max(length - 1 - i, 0)) / steps) * 100) / 100;
    const latest = [...recorded].reverse().find((d) => d.date <= date);
    const actual =
      sprint.status === 'PLANNED' || date > today ? undefined : latest?.remainingPoints;
    return {
      date,
      idealRemaining: ideal,
      ...(actual !== undefined ? { actualRemaining: actual } : {}),
    };
  });
  return {
    sprintId: sprint.id,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    committedPoints: committed,
    days,
  };
}

export function velocity(projectId: string, last: number): Velocity {
  const closed = db.state.sprints
    .filter((s) => s.projectId === projectId && s.status === 'CLOSED')
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, last)
    .reverse();
  const sprints = closed.map((s) => ({
    sprintId: s.id,
    name: s.name,
    endDate: s.endDate,
    committedPoints: s.committedPoints ?? 0,
    completedPoints: s.completedPoints ?? 0,
  }));
  if (!sprints.length) return { sprints: [] };
  const completed = sprints.map((s) => s.completedPoints);
  const average = Math.round((completed.reduce((t, c) => t + c, 0) / completed.length) * 100) / 100;
  return { sprints, average, low: Math.min(...completed), high: Math.max(...completed) };
}

// ---------- Work package progress from tasks ----------

/**
 * A finished task counts 100%; an unfinished one the share of its estimate already burnt, or 0%
 * without one. Tasks are weighted by their estimate, at least one hour.
 */
export function taskProgress(tasks: readonly TaskRecord[]): number {
  if (!tasks.length) return 0;
  let weighted = 0;
  let total = 0;
  for (const task of tasks) {
    const weight = Math.max(task.estimateHours ?? 1, 1);
    let percent = 0;
    if (task.status === 'DONE') percent = 100;
    else if (task.estimateHours && task.remainingHours !== undefined) {
      percent = Math.min(
        (Math.max(task.estimateHours - task.remainingHours, 0) * 100) / task.estimateHours,
        100,
      );
    }
    weighted += percent * weight;
    total += weight;
  }
  return Math.round((weighted / total) * 100) / 100;
}

export function tasksOfWorkPackage(nodeId: string): TaskRecord[] {
  return db.state.tasks.filter((t) => t.wbsNodeId === nodeId);
}
