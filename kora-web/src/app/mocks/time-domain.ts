import {
  Allocation,
  Capacity,
  ResourceHeatmap,
  ResourceWeek,
  Timesheet,
  TimesheetEntry,
  TimesheetStatus,
  TimesheetSummary,
  TimesheetWeek,
} from '../core/api/api.models';
import { daysOfWeek, isoWeekOf, plusDays } from '../shared/format/iso-week';
import { MembershipRecord } from './data';
import { ProjectRecord } from './data-projects';
import { TimeEntryRecord, TimesheetRecord } from './data-time';
import { db } from './db';
import { toUnits } from './decimal';
import { calendarOf } from './schedule-domain';
import { userRef } from './projects-domain';
import { manages } from './work-domain';

/**
 * Features 15–16 as the API implements them (contract 0.6.0): one timesheet per person per project
 * per ISO week, each approved by that project's managers; the week's status rolls up from them;
 * capacity from weekly hours, holidays and leave; utilization bands.
 */

export const DEFAULT_HOURS_PER_WEEK = 40;

function projectCode(projectId: string): string {
  return db.state.projects.find((p) => p.id === projectId)?.code ?? '?';
}

// ---------- Timesheets ----------

/** Managers and contributors log time on a project. */
export function worksOn(project: ProjectRecord, userId: string): boolean {
  return (
    project.managerId === userId ||
    db.state.projectMembers.some(
      (m) => m.projectId === project.id && m.userId === userId && m.projectRole === 'CONTRIBUTOR',
    )
  );
}

export function entriesOf(sheet: TimesheetRecord): TimeEntryRecord[] {
  const end = plusDays(sheet.weekStart, 6);
  return db.state.timeEntries
    .filter(
      (e) =>
        e.userId === sheet.userId &&
        e.projectId === sheet.projectId &&
        e.date >= sheet.weekStart &&
        e.date <= end,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.taskKey.localeCompare(b.taskKey));
}

const sum = (hours: readonly number[]) => Math.round(hours.reduce((t, h) => t + h, 0) * 100) / 100;

export function toEntry(record: TimeEntryRecord): TimesheetEntry {
  return {
    id: record.id,
    ...(record.taskId ? { taskId: record.taskId } : {}),
    taskKey: record.taskKey,
    taskTitle: record.taskTitle,
    projectId: record.projectId,
    date: record.date,
    hours: record.hours,
    ...(record.note ? { note: record.note } : {}),
    billable: record.billable,
  };
}

export function toSummary(sheet: TimesheetRecord): TimesheetSummary {
  return {
    id: sheet.id,
    projectId: sheet.projectId,
    projectCode: projectCode(sheet.projectId),
    user: userRef(sheet.userId),
    weekStart: sheet.weekStart,
    status: sheet.status,
    totalHours: sum(entriesOf(sheet).map((e) => e.hours)),
    ...(sheet.submittedAt ? { submittedAt: sheet.submittedAt } : {}),
    ...(sheet.decidedById ? { decidedBy: userRef(sheet.decidedById) } : {}),
    ...(sheet.decidedAt ? { decidedAt: sheet.decidedAt } : {}),
    ...(sheet.comment ? { comment: sheet.comment } : {}),
  };
}

export function toTimesheet(sheet: TimesheetRecord): Timesheet {
  return { ...toSummary(sheet), entries: entriesOf(sheet).map(toEntry) };
}

/** A person's sheets of a week, in one organization. */
export function sheetsOf(userId: string, organizationId: string, weekStart: string) {
  return db.state.timesheets.filter(
    (s) =>
      s.userId === userId &&
      s.weekStart === weekStart &&
      db.state.projects.find((p) => p.id === s.projectId)?.organizationId === organizationId,
  );
}

/** Editable sheets: drafts and sheets sent back. */
export const isOpen = (status: TimesheetStatus) => status === 'DRAFT' || status === 'REJECTED';

export function weekStatus(sheets: readonly TimesheetRecord[]): TimesheetStatus {
  if (!sheets.length) return 'DRAFT';
  if (sheets.every((s) => s.status === 'APPROVED')) return 'APPROVED';
  if (sheets.some((s) => s.status === 'REJECTED')) return 'REJECTED';
  if (sheets.every((s) => s.status === 'SUBMITTED' || s.status === 'APPROVED')) return 'SUBMITTED';
  return 'DRAFT';
}

export function timesheetWeek(membership: MembershipRecord, weekStart: string): TimesheetWeek {
  const sheets = sheetsOf(membership.userId, membership.organizationId, weekStart);
  const days = daysOfWeek(isoWeekOf(weekStart));
  const projects = new Set(
    db.state.projects
      .filter((p) => p.organizationId === membership.organizationId)
      .map((p) => p.id),
  );
  const entries = db.state.timeEntries
    .filter(
      (e) =>
        e.userId === membership.userId &&
        projects.has(e.projectId) &&
        e.date >= days[0] &&
        e.date <= days[6],
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.taskKey.localeCompare(b.taskKey));
  return {
    week: isoWeekOf(weekStart),
    weekStart: days[0],
    weekEnd: days[6],
    status: weekStatus(sheets),
    editable: !sheets.length || sheets.some((s) => isOpen(s.status)),
    totalHours: sum(entries.map((e) => e.hours)),
    dailyTotals: days.map((date) => ({
      date,
      hours: sum(entries.filter((e) => e.date === date).map((e) => e.hours)),
    })),
    entries: entries.map(toEntry),
    sheets: sheets
      .sort((a, b) => projectCode(a.projectId).localeCompare(projectCode(b.projectId)))
      .map(toSummary),
  };
}

/** Who may decide a sheet: the project's managers, never its owner. */
export function canDecide(sheet: TimesheetRecord, membership: MembershipRecord): boolean {
  const project = db.state.projects.find((p) => p.id === sheet.projectId);
  return !!project && manages(project, membership);
}

// ---------- Cost ----------

/** The hourly rate (units) valid on `date`, or undefined without one. */
export function rateOn(organizationId: string, userId: string, date: string): bigint | undefined {
  const rate = db.state.costRates
    .filter(
      (r) => r.organizationId === organizationId && r.userId === userId && r.validFrom <= date,
    )
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  return rate ? toUnits(rate.hourlyRate.amount) : undefined;
}

/** Hours → units: hours are quarter hours, so × 100 keeps them exact. */
export function costOf(hours: number, rate: bigint): bigint {
  return (BigInt(Math.round(hours * 100)) * rate) / 100n;
}

// ---------- Capacity ----------

export function hoursPerWeekOn(organizationId: string, userId: string, date: string): number {
  const period = db.state.capacities
    .filter(
      (c) => c.organizationId === organizationId && c.userId === userId && c.validFrom <= date,
    )
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  return period?.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
}

export function toCapacity(organizationId: string, userId: string, today: string): Capacity {
  return {
    userId,
    hoursPerWeek: hoursPerWeekOn(organizationId, userId, today),
    history: db.state.capacities
      .filter((c) => c.organizationId === organizationId && c.userId === userId)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
      .map((c) => ({ hoursPerWeek: c.hoursPerWeek, validFrom: c.validFrom })),
    leave: db.state.leave
      .filter((l) => l.organizationId === organizationId && l.userId === userId)
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((l) => ({
        id: l.id,
        userId: l.userId,
        from: l.from,
        to: l.to,
        ...(l.reason ? { reason: l.reason } : {}),
      })),
  };
}

/** Capacity of a week: weekly hours × the week's working days ÷ normal working days. */
export function weekCapacity(organizationId: string, userId: string, monday: string): number {
  const calendar = calendarOf(organizationId);
  const holidays = new Set(calendar.holidays.map((h) => h.date));
  const leave = db.state.leave.filter(
    (l) => l.organizationId === organizationId && l.userId === userId,
  );
  const days = daysOfWeek(isoWeekOf(monday));
  const normal = days.filter((d) => calendar.workingDays.includes(weekdayName(d))).length;
  if (normal === 0) return 0;
  const working = days.filter(
    (d) =>
      calendar.workingDays.includes(weekdayName(d)) &&
      !holidays.has(d) &&
      !leave.some((l) => l.from <= d && d <= l.to),
  ).length;
  const hours = hoursPerWeekOn(organizationId, userId, monday);
  return Math.round(((hours * working) / normal) * 100) / 100;
}

const NAMES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
function weekdayName(date: string) {
  return NAMES[daysOfWeek(isoWeekOf(date)).indexOf(date)];
}

export function toAllocation(record: {
  userId: string;
  projectId: string;
  weekStart: string;
  hours: number;
}): Allocation {
  return {
    user: userRef(record.userId),
    projectId: record.projectId,
    weekStart: record.weekStart,
    hours: record.hours,
  };
}

/** The people × weeks heat map (from/to already Mondays). */
export function heatmap(
  organizationId: string,
  people: readonly string[],
  from: string,
  to: string,
): ResourceHeatmap {
  const weeks: string[] = [];
  for (let monday = from; monday <= to; monday = plusDays(monday, 7)) weeks.push(monday);
  const orgProjects = new Set(
    db.state.projects.filter((p) => p.organizationId === organizationId).map((p) => p.id),
  );
  return {
    from,
    to,
    people: people
      .map((userId) => ({
        user: userRef(userId),
        weeks: weeks.map((weekStart): ResourceWeek => {
          const capacityHours = weekCapacity(organizationId, userId, weekStart);
          const allocatedHours = sum(
            db.state.allocations
              .filter(
                (a) =>
                  a.userId === userId && a.weekStart === weekStart && orgProjects.has(a.projectId),
              )
              .map((a) => a.hours),
          );
          const end = plusDays(weekStart, 6);
          const actualHours = sum(
            db.state.timeEntries
              .filter(
                (e) =>
                  e.userId === userId &&
                  orgProjects.has(e.projectId) &&
                  e.date >= weekStart &&
                  e.date <= end,
              )
              .map((e) => e.hours),
          );
          if (capacityHours === 0) return { weekStart, capacityHours, allocatedHours, actualHours };
          const utilization = Math.round((allocatedHours / capacityHours) * 1000) / 10;
          return {
            weekStart,
            capacityHours,
            allocatedHours,
            actualHours,
            utilization,
            band: utilization < 70 ? 'UNDER' : utilization <= 100 ? 'HEALTHY' : 'OVER',
          };
        }),
      }))
      .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName)),
  };
}
