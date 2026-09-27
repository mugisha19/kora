import { DayOfWeek, DependencyType } from '../core/api/api.models';
import { ORG_AKAGERA, USER } from './data';
import { PROJECT } from './data-projects';
import { TaskRecord, rankAt } from './data-work';
import { Activity, Link, WorkingDays, criticalPath } from './cpm';

/**
 * Phase 6 demo data (feature 10): the data warehouse (Predictive, managed by the demo project
 * manager) has a small network of tasks with every link type and a lead, a baseline saved before
 * the permits took longer (so later tasks show a positive variance), and Akagera's calendar with
 * Rwanda's public holidays. All fictional.
 */

export interface DependencyRecord {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
  createdAt: string;
}

export interface BaselineRecord {
  id: string;
  projectId: string;
  number: number;
  savedAt: string;
  savedById: string;
  tasks: { taskId: string; start: string; finish: string }[];
}

export interface CalendarRecord {
  organizationId: string;
  workingDays: DayOfWeek[];
  holidays: { date: string; name: string }[];
  version: number;
}

export interface ScheduleSeed {
  dependencies: DependencyRecord[];
  baselines: BaselineRecord[];
  calendars: CalendarRecord[];
}

const DAY = 86_400_000;
const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export const WEEKDAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** Warehouse tasks by number (keys AKG-005-1 … AKG-005-8). */
export const WAREHOUSE_TASK = (n: number) => id('7f3b2c3d', n);

export function createScheduleSeed(
  now: number,
  warehouseStart: string,
): ScheduleSeed & { tasks: TaskRecord[] } {
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  const year = Number(at(0).slice(0, 4));

  const calendars: CalendarRecord[] = [
    {
      organizationId: ORG_AKAGERA,
      workingDays: WEEKDAYS,
      holidays: [
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Boxing Day' },
        { date: `${year + 1}-01-01`, name: "New Year's Day" },
        { date: `${year + 1}-02-01`, name: 'National Heroes Day' },
      ],
      version: 1,
    },
  ];

  // [number, title, working days, rank]
  const spec: [number, string, number][] = [
    [1, 'Inventory the source systems', 5],
    [2, 'Design the data model', 8],
    [3, 'Approve data access with legal', 10],
    [4, 'Build the finance data mart', 10],
    [5, 'Build the customer data mart', 12],
    [6, 'Nightly load and data quality checks', 6],
    [7, 'Management dashboards', 8],
    [8, 'First data mart live', 0],
  ];
  const tasks: TaskRecord[] = spec.map(([n, title, duration]) => ({
    id: WAREHOUSE_TASK(n),
    projectId: PROJECT.warehouse,
    number: n,
    title,
    type: duration === 0 ? 'CHORE' : 'TASK',
    priority: n === 3 ? 'HIGH' : 'MEDIUM',
    status: 'TODO',
    labels: [],
    durationDays: duration,
    ...(n <= 2 ? { assigneeId: USER.pm } : {}),
    rank: rankAt(200 + n),
    createdAt: at(-20),
    version: 1,
  }));

  const link = (
    n: number,
    from: number,
    to: number,
    type: DependencyType = 'FS',
    lagDays = 0,
  ): DependencyRecord => ({
    id: id('7f4b2c3d', n),
    projectId: PROJECT.warehouse,
    predecessorId: WAREHOUSE_TASK(from),
    successorId: WAREHOUSE_TASK(to),
    type,
    lagDays,
    createdAt: at(-19 + n / 10),
  });
  const dependencies: DependencyRecord[] = [
    link(1, 1, 2),
    link(2, 2, 3),
    link(3, 2, 4, 'SS', 3), // the marts start 3 days into the design
    link(4, 3, 4),
    link(5, 3, 5),
    link(6, 4, 6, 'FS', -2), // a 2-day lead: loads overlap the end of the build
    link(7, 5, 6),
    link(8, 6, 7, 'SS', 2),
    link(9, 6, 8, 'FF'),
    link(10, 7, 8),
  ];

  // The baseline was saved when legal approval was planned at 6 days, not 10.
  const days = new WorkingDays(
    new Set(WEEKDAYS),
    new Set(calendars[0].holidays.map((h) => h.date)),
    warehouseStart,
  );
  const planned: Activity[] = tasks.map((t) => ({
    id: t.id,
    duration: t.number === 3 ? 6 : (t.durationDays ?? 1),
    notBefore: 0,
  }));
  const links: Link[] = dependencies.map((d) => ({
    predecessor: d.predecessorId,
    successor: d.successorId,
    type: d.type,
    lag: d.lagDays,
  }));
  const result = criticalPath(planned, links);
  const baselines: BaselineRecord[] = [
    {
      id: id('7f5b2c3d', 1),
      projectId: PROJECT.warehouse,
      number: 1,
      savedAt: at(-10),
      savedById: USER.pm,
      tasks: planned.map((a) => {
        const timing = result.timings.get(a.id);
        const start = timing?.earlyStart ?? 0;
        return {
          taskId: a.id,
          start: days.date(start),
          finish: days.date(a.duration === 0 ? start : start + a.duration - 1),
        };
      }),
    },
  ];

  return { tasks, dependencies, baselines, calendars };
}
