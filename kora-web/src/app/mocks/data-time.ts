import { Money, TimesheetStatus } from '../core/api/api.models';
import { mondayOf, plusDays } from '../shared/format/iso-week';
import { ORG_AKAGERA, USER, kigaliDate } from './data';
import { PEOPLE, PROJECT } from './data-projects';
import { TaskRecord } from './data-work';

/**
 * Phase 8 demo data (features 15–17): four months of approved time on the mobile app (so its
 * actual cost and CPI are realistic), last week waiting for approval (one sheet sent back with a
 * comment), this week in progress; cost rates with one change; a part-time designer; leave; and
 * allocations that put the project manager over capacity. All fictional.
 */

export interface TimeEntryRecord {
  id: string;
  userId: string;
  projectId: string;
  /** Absent once the task was deleted; the key and title stay as they were. */
  taskId?: string;
  taskKey: string;
  taskTitle: string;
  date: string;
  hours: number;
  note?: string;
  billable: boolean;
}

export interface TimesheetRecord {
  id: string;
  userId: string;
  projectId: string;
  /** Monday. */
  weekStart: string;
  status: TimesheetStatus;
  submittedAt?: string;
  decidedById?: string;
  decidedAt?: string;
  comment?: string;
}

export interface CostRateRecord {
  id: string;
  organizationId: string;
  userId: string;
  hourlyRate: Money;
  validFrom: string;
  createdAt: string;
}

export interface CapacityRecord {
  organizationId: string;
  userId: string;
  hoursPerWeek: number;
  validFrom: string;
}

export interface LeaveRecord {
  id: string;
  organizationId: string;
  userId: string;
  from: string;
  to: string;
  reason?: string;
}

export interface AllocationRecord {
  userId: string;
  projectId: string;
  /** Monday. */
  weekStart: string;
  hours: number;
}

export interface EvmSettingsRecord {
  projectId: string;
  percentCompleteMethod: 'PHYSICAL' | 'ZERO_HUNDRED' | 'FIFTY_FIFTY' | 'STORY_POINTS';
  eacMethod: 'TYPICAL' | 'ATYPICAL' | 'COMPOSITE';
  version: number;
}

/** A weekly earned-value snapshot: EV as it was measured then (PV and AC can be recomputed). */
export interface EvmSnapshotRecord {
  projectId: string;
  /** Sunday. */
  weekEnding: string;
  ev: string;
}

export interface TimeSeed {
  timeEntries: TimeEntryRecord[];
  timesheets: TimesheetRecord[];
  costRates: CostRateRecord[];
  capacities: CapacityRecord[];
  leave: LeaveRecord[];
  allocations: AllocationRecord[];
  evmSettings: EvmSettingsRecord[];
  evmSnapshots: EvmSnapshotRecord[];
  /** The demo's past snapshots are made on first use (they need the rest of the state). */
  evmSnapshotsSeeded: boolean;
}

const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export const TIMESHEET = (n: number) => id('8e1b2c3d', n);
const ENTRY = (n: number) => id('8e2b2c3d', n);
const rwf = (amount: string): Money => ({ amount, currency: 'RWF' });

/** Weeks of approved history before last week. */
const HISTORY_WEEKS = 15;

export function createTimeSeed(now: number, tasks: readonly TaskRecord[]): TimeSeed {
  const today = kigaliDate(now);
  const thisWeek = mondayOf(today);
  const week = (offset: number) => plusDays(thisWeek, offset * 7);
  const taskOf = (projectId: string, number: number) => {
    const task = tasks.find((t) => t.projectId === projectId && t.number === number);
    if (!task) throw new Error(`No task ${number}`);
    return task;
  };
  const code = (projectId: string) =>
    projectId === PROJECT.mobile ? 'AKG-001' : projectId === PROJECT.erp ? 'AKG-003' : '?';

  const timeEntries: TimeEntryRecord[] = [];
  const timesheets: TimesheetRecord[] = [];
  let entryNo = 0;
  let sheetNo = 0;

  /** One person's week on one project: `hours` a day, Monday to `days`. */
  const sheet = (
    userId: string,
    projectId: string,
    weekStart: string,
    hoursPerDay: number,
    taskNumbers: readonly number[],
    status: TimesheetStatus,
    decision: Partial<TimesheetRecord> = {},
    days = 5,
  ) => {
    for (let d = 0; d < days; d++) {
      const task = taskOf(projectId, taskNumbers[d % taskNumbers.length]);
      timeEntries.push({
        id: ENTRY(++entryNo),
        userId,
        projectId,
        taskId: task.id,
        taskKey: `${code(projectId)}-${task.number}`,
        taskTitle: task.title,
        date: plusDays(weekStart, d),
        hours: hoursPerDay,
        billable: false,
      });
    }
    const weekEnd = plusDays(weekStart, 6);
    timesheets.push({
      id: TIMESHEET(++sheetNo),
      userId,
      projectId,
      weekStart,
      status,
      ...(status !== 'DRAFT' ? { submittedAt: `${plusDays(weekEnd, -2)}T16:00:00.000Z` } : {}),
      ...(status === 'APPROVED' || status === 'REJECTED'
        ? { decidedAt: `${plusDays(weekEnd, 1)}T09:00:00.000Z` }
        : {}),
      ...decision,
    });
  };

  const mobileTasks = [41, 42, 43, 44, 45, 46, 47, 49];
  for (let w = HISTORY_WEEKS + 1; w >= 2; w--) {
    const start = week(-w);
    const rotate = (offset: number) => mobileTasks.slice((w + offset) % 4, ((w + offset) % 4) + 3);
    sheet(USER.member, PROJECT.mobile, start, 7, rotate(0), 'APPROVED', { decidedById: USER.pm });
    sheet(PEOPLE.odette, PROJECT.mobile, start, 6, rotate(2), 'APPROVED', { decidedById: USER.pm });
    // The project manager's own time goes to the PMO.
    sheet(USER.pm, PROJECT.mobile, start, 2, [48, 50], 'APPROVED', { decidedById: USER.pmo });
    if (w <= 8) {
      sheet(USER.pm, PROJECT.erp, start, 3, [1, 2], 'APPROVED', { decidedById: PEOPLE.alice });
    }
  }
  // The ERP's manager logs her own time there (approved by the PMO) since the project started.
  for (let w = 22; w >= 2; w--) {
    sheet(PEOPLE.alice, PROJECT.erp, week(-w), 6, [1, 2, 3], 'APPROVED', { decidedById: USER.pmo });
  }
  // Last week: waiting for the project manager, one sent back.
  sheet(USER.member, PROJECT.mobile, week(-1), 7, [49, 57], 'SUBMITTED');
  sheet(PEOPLE.odette, PROJECT.mobile, week(-1), 6, [52, 53], 'REJECTED', {
    decidedById: USER.pm,
    comment: 'Friday’s hours belong to the school fees story, not to top-up. Please move them.',
  });
  sheet(USER.pm, PROJECT.mobile, week(-1), 2, [48], 'SUBMITTED');
  // This week: the member has started filling it in.
  sheet(USER.member, PROJECT.mobile, week(0), 7, [49, 57], 'DRAFT', {}, 2);

  const rate = (n: number, userId: string, amount: string, validFrom: string) => ({
    id: id('8e3b2c3d', n),
    organizationId: ORG_AKAGERA,
    userId,
    hourlyRate: rwf(amount),
    validFrom,
    createdAt: `${validFrom}T08:00:00.000Z`,
  });
  const costRates: CostRateRecord[] = [
    rate(1, USER.member, '16000', '2025-01-01'),
    rate(2, USER.member, '18000', week(-8)),
    rate(3, PEOPLE.odette, '22000', '2025-01-01'),
    rate(4, USER.pm, '28000', '2025-01-01'),
    rate(5, PEOPLE.alice, '30000', '2025-01-01'),
  ];

  const capacities: CapacityRecord[] = [
    {
      organizationId: ORG_AKAGERA,
      userId: PEOPLE.odette,
      hoursPerWeek: 40,
      validFrom: '2025-01-01',
    },
    { organizationId: ORG_AKAGERA, userId: PEOPLE.odette, hoursPerWeek: 32, validFrom: week(-12) },
  ];

  const leave: LeaveRecord[] = [
    {
      id: id('8e4b2c3d', 1),
      organizationId: ORG_AKAGERA,
      userId: USER.member,
      from: plusDays(week(1), 2),
      to: plusDays(week(1), 4),
      reason: 'Family event',
    },
    {
      id: id('8e4b2c3d', 2),
      organizationId: ORG_AKAGERA,
      userId: PEOPLE.odette,
      from: week(-2),
      to: plusDays(week(-2), 1),
    },
  ];

  const allocations: AllocationRecord[] = [];
  for (let w = -4; w <= 12; w++) {
    const weekStart = week(w);
    allocations.push(
      { userId: USER.member, projectId: PROJECT.mobile, weekStart, hours: 35 },
      { userId: PEOPLE.odette, projectId: PROJECT.mobile, weekStart, hours: 28 },
      { userId: USER.pm, projectId: PROJECT.mobile, weekStart, hours: 12 },
      { userId: USER.pm, projectId: PROJECT.erp, weekStart, hours: 20 },
      { userId: PEOPLE.alice, projectId: PROJECT.erp, weekStart, hours: 30 },
    );
    // The warehouse starts next month: the project manager is over capacity from then on.
    if (w >= 4)
      allocations.push({ userId: USER.pm, projectId: PROJECT.warehouse, weekStart, hours: 16 });
  }

  return {
    timeEntries,
    timesheets,
    costRates,
    capacities,
    leave,
    allocations,
    evmSettings: [],
    evmSnapshots: [],
    evmSnapshotsSeeded: false,
  };
}
