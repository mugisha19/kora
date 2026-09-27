import {
  BoardStatus,
  SprintStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../core/api/api.models';
import { USER } from './data';
import { PEOPLE, PROJECT } from './data-projects';

/**
 * Phase 5 demo data (features 08–09): the mobile banking app runs Scrum — four closed sprints for
 * velocity, an active sprint with a WIP limit reached and a blocked task, a planned next sprint
 * and a backlog. The ERP rollout tracks its "Payables and receivables" work package with tasks,
 * so that package's progress comes from them. All fictional.
 */

export interface TaskRecord {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  blockedReason?: string;
  assigneeId?: string;
  wbsNodeId?: string;
  sprintId?: string;
  storyPoints?: number;
  estimateHours?: number;
  remainingHours?: number;
  startDate?: string;
  dueDate?: string;
  labels: string[];
  /** Opaque, lexicographically ordered across the whole project. */
  rank: string;
  createdAt: string;
  completedAt?: string;
  version: number;
}

export interface TaskCommentRecord {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface SprintRecord {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  committedPoints?: number;
  completedPoints?: number;
  createdAt: string;
  version: number;
}

/** A column's settings; a column without a record has its default name and no WIP limit. */
export interface BoardColumnRecord {
  projectId: string;
  status: BoardStatus;
  name: string;
  wipLimit?: number;
}

/** Remaining story points of a sprint at the end of a day (the burndown's actual line). */
export interface SprintDayRecord {
  sprintId: string;
  date: string;
  remainingPoints: number;
}

export interface WorkSeed {
  tasks: TaskRecord[];
  taskComments: TaskCommentRecord[];
  sprints: SprintRecord[];
  boardColumns: BoardColumnRecord[];
  sprintDays: SprintDayRecord[];
}

const DAY = 86_400_000;
const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;

export const SPRINT = {
  one: id('7e1b2c3d', 1),
  two: id('7e1b2c3d', 2),
  three: id('7e1b2c3d', 3),
  four: id('7e1b2c3d', 4),
  active: id('7e1b2c3d', 5),
  next: id('7e1b2c3d', 6),
} as const;

/** The ERP's "Payables and receivables" work package (18th node created in data-projects). */
export const WBS_PAYABLES = id('7d1b2c3d', 17);

/** Rank of the n-th task of a project: wide gaps leave room to insert between neighbours. */
export function rankAt(n: number): string {
  return String(n * 1_000_000).padStart(15, '0');
}

export function createWorkSeed(now = Date.now()): WorkSeed {
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  const date = (days: number) => at(days).slice(0, 10);

  const sprint = (
    key: keyof typeof SPRINT,
    name: string,
    start: number,
    status: SprintStatus,
    points: { committed?: number; completed?: number } = {},
    goal?: string,
  ): SprintRecord => ({
    id: SPRINT[key],
    projectId: PROJECT.mobile,
    name,
    ...(goal ? { goal } : {}),
    startDate: date(start),
    endDate: date(start + 13),
    status,
    ...(points.committed !== undefined ? { committedPoints: points.committed } : {}),
    ...(points.completed !== undefined ? { completedPoints: points.completed } : {}),
    createdAt: at(start - 3),
    version: status === 'PLANNED' ? 1 : status === 'ACTIVE' ? 2 : 3,
  });

  const sprints: SprintRecord[] = [
    sprint(
      'one',
      'Sprint 1',
      -76,
      'CLOSED',
      { committed: 21, completed: 18 },
      'Log in and see balances',
    ),
    sprint(
      'two',
      'Sprint 2',
      -62,
      'CLOSED',
      { committed: 24, completed: 20 },
      'Transfers between own accounts',
    ),
    sprint(
      'three',
      'Sprint 3',
      -48,
      'CLOSED',
      { committed: 22, completed: 23 },
      'Statements and notifications',
    ),
    sprint(
      'four',
      'Sprint 4',
      -34,
      'CLOSED',
      { committed: 26, completed: 22 },
      'Bill payments, first providers',
    ),
    sprint(
      'active',
      'Sprint 5',
      -6,
      'ACTIVE',
      { committed: 29 },
      'Security hardening for the beta',
    ),
    sprint('next', 'Sprint 6', 8, 'PLANNED', {}, 'Beta with staff'),
  ];

  let order = 0;
  const tasks: TaskRecord[] = [];
  const task = (
    projectId: string,
    number: number,
    title: string,
    fields: Partial<TaskRecord> & { type?: TaskType; status?: TaskStatus } = {},
  ) => {
    order += 1;
    tasks.push({
      id: id('7f1b2c3d', order),
      projectId,
      number,
      title,
      type: 'STORY',
      priority: 'MEDIUM',
      status: 'BACKLOG',
      labels: [],
      rank: rankAt(order),
      createdAt: at(-40 + order / 10),
      version: 1,
      ...fields,
    });
  };

  const active = { sprintId: SPRINT.active };
  // Sprint 5 (active): 29 points committed, 8 done.
  task(PROJECT.mobile, 41, 'Lock the app after 5 minutes idle', {
    ...active,
    status: 'DONE',
    storyPoints: 5,
    assigneeId: USER.member,
    labels: ['security'],
    estimateHours: 16,
    remainingHours: 0,
    completedAt: at(-3),
  });
  task(PROJECT.mobile, 42, 'Certificate pinning for the API', {
    ...active,
    status: 'DONE',
    storyPoints: 3,
    assigneeId: USER.pm,
    labels: ['security'],
    type: 'TASK',
    estimateHours: 8,
    remainingHours: 0,
    completedAt: at(-1),
  });
  task(PROJECT.mobile, 43, 'Two-step sign-in with SMS codes', {
    ...active,
    status: 'IN_REVIEW',
    storyPoints: 8,
    assigneeId: USER.member,
    priority: 'HIGH',
    labels: ['security'],
    estimateHours: 24,
    remainingHours: 2,
    description:
      'Send a 6-digit code by SMS after the password.\n\n- Code valid for **5 minutes**\n- 3 attempts, then wait 15 minutes',
  });
  task(PROJECT.mobile, 44, 'Jailbreak and root detection', {
    ...active,
    status: 'IN_PROGRESS',
    storyPoints: 3,
    assigneeId: PEOPLE.odette,
    labels: ['security'],
    estimateHours: 12,
    remainingHours: 6,
  });
  task(PROJECT.mobile, 45, 'Crash when rotating on the transfer screen', {
    ...active,
    status: 'IN_PROGRESS',
    type: 'BUG',
    priority: 'CRITICAL',
    storyPoints: 2,
    assigneeId: USER.pm,
    estimateHours: 4,
    remainingHours: 3,
    labels: ['android'],
  });
  task(PROJECT.mobile, 46, 'Hide balances in the app switcher', {
    ...active,
    status: 'IN_PROGRESS',
    storyPoints: 2,
    assigneeId: USER.member,
    estimateHours: 6,
    remainingHours: 4,
    labels: ['security'],
  });
  task(PROJECT.mobile, 47, 'Penetration test fixes', {
    ...active,
    status: 'BLOCKED',
    storyPoints: 3,
    priority: 'HIGH',
    type: 'TASK',
    blockedReason: 'Waiting for the external pen-test report',
    labels: ['security'],
  });
  task(PROJECT.mobile, 48, 'Update the privacy notice', {
    ...active,
    status: 'TODO',
    storyPoints: 1,
    type: 'CHORE',
    dueDate: date(5),
  });
  task(PROJECT.mobile, 49, 'Biometric sign-in on Android', {
    ...active,
    status: 'TODO',
    storyPoints: 2,
    labels: ['android'],
    dueDate: date(6),
  });
  // Sprint 6 (planned)
  task(PROJECT.mobile, 50, 'Invite staff to the beta', {
    sprintId: SPRINT.next,
    storyPoints: 2,
    type: 'TASK',
  });
  task(PROJECT.mobile, 51, 'In-app feedback form', { sprintId: SPRINT.next, storyPoints: 5 });
  // Product backlog
  task(PROJECT.mobile, 52, 'Pay school fees', {
    storyPoints: 8,
    priority: 'HIGH',
    labels: ['payments'],
  });
  task(PROJECT.mobile, 53, 'Mobile money top-up', {
    storyPoints: 5,
    priority: 'HIGH',
    labels: ['payments'],
  });
  task(PROJECT.mobile, 54, 'Dark theme', { storyPoints: 3, priority: 'LOW' });
  task(PROJECT.mobile, 55, 'Kinyarwanda translation review', { storyPoints: 2, type: 'CHORE' });
  task(PROJECT.mobile, 56, 'Transfer limits per day', { storyPoints: 5 });
  task(PROJECT.mobile, 57, 'Wrong balance after a failed transfer', {
    type: 'BUG',
    priority: 'HIGH',
    status: 'TODO',
    storyPoints: 3,
  });
  // ERP: tasks drive the "Payables and receivables" work package (source TASKS).
  const payables = { wbsNodeId: WBS_PAYABLES, type: 'TASK' as const };
  task(PROJECT.erp, 1, 'Import open supplier invoices', {
    ...payables,
    status: 'DONE',
    assigneeId: USER.pm,
    estimateHours: 40,
    remainingHours: 0,
    completedAt: at(-10),
  });
  task(PROJECT.erp, 2, 'Payment run approval workflow', {
    ...payables,
    status: 'IN_PROGRESS',
    assigneeId: USER.pm,
    estimateHours: 80,
    remainingHours: 30,
  });
  task(PROJECT.erp, 3, 'Customer receipts matching', {
    ...payables,
    status: 'TODO',
    estimateHours: 60,
    remainingHours: 60,
  });

  const taskComments: TaskCommentRecord[] = [
    {
      id: id('7f2b2c3d', 1),
      taskId: id('7f1b2c3d', 3),
      authorId: USER.pm,
      body: 'Security review asked for **rate limiting** on code requests too.',
      createdAt: at(-2),
    },
    {
      id: id('7f2b2c3d', 2),
      taskId: id('7f1b2c3d', 3),
      authorId: USER.member,
      body: 'Added: at most 3 codes per 15 minutes. Ready for review.',
      createdAt: at(-1),
    },
  ];

  const boardColumns: BoardColumnRecord[] = [
    { projectId: PROJECT.mobile, status: 'IN_PROGRESS', name: 'In progress', wipLimit: 3 },
    { projectId: PROJECT.mobile, status: 'IN_REVIEW', name: 'Code review', wipLimit: 2 },
  ];

  const remaining = [29, 29, 27, 27, 24, 21, 21];
  const sprintDays: SprintDayRecord[] = remaining.map((points, i) => ({
    sprintId: SPRINT.active,
    date: date(-6 + i),
    remainingPoints: points,
  }));

  return { tasks, taskComments, sprints, boardColumns, sprintDays };
}
