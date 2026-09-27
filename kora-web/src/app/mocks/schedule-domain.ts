import { Schedule, ScheduledTask, WorkingCalendar } from '../core/api/api.models';
import { ProjectRecord } from './data-projects';
import { CalendarRecord, WEEKDAYS } from './data-schedule';
import { TaskRecord } from './data-work';
import { Activity, Link, WorkingDays, criticalPath } from './cpm';
import { db } from './db';
import { userRef } from './projects-domain';
import { tasksOf, toTask } from './work-domain';

/** The organization's calendar, or the default Monday–Friday one (version 0, never saved). */
export function calendarOf(organizationId: string): CalendarRecord {
  return (
    db.state.calendars.find((c) => c.organizationId === organizationId) ?? {
      organizationId,
      workingDays: WEEKDAYS,
      holidays: [],
      version: 0,
    }
  );
}

export function toCalendar(record: CalendarRecord): WorkingCalendar {
  return {
    workingDays: record.workingDays,
    holidays: [...record.holidays].sort((a, b) => a.date.localeCompare(b.date)),
    version: record.version,
  };
}

export function workingDaysOf(project: ProjectRecord): WorkingDays {
  const calendar = calendarOf(project.organizationId);
  return new WorkingDays(
    new Set(calendar.workingDays),
    new Set(calendar.holidays.map((h) => h.date)),
    project.startDate,
  );
}

export function linksOf(projectId: string): Link[] {
  return db.state.dependencies
    .filter((d) => d.projectId === projectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => ({
      predecessor: d.predecessorId,
      successor: d.successorId,
      type: d.type,
      lag: d.lagDays,
    }));
}

const durationOf = (task: TaskRecord) => task.durationDays ?? 1;

/** The CPM schedule of a project, as the API returns it. Throws `CycleError` on a loop. */
export function scheduleOf(project: ProjectRecord): Schedule {
  const days = workingDaysOf(project);
  const tasks = tasksOf(project.id);
  const activities: Activity[] = tasks.map((t) => ({
    id: t.id,
    duration: durationOf(t),
    notBefore:
      t.scheduleConstraint === 'START_NO_EARLIER_THAN' && t.constraintDate
        ? Math.max(0, days.index(t.constraintDate))
        : 0,
  }));
  const result = criticalPath(activities, linksOf(project.id));
  const baseline = db.state.baselines
    .filter((b) => b.projectId === project.id)
    .sort((a, b) => b.number - a.number)[0];
  const planned = new Map((baseline?.tasks ?? []).map((t) => [t.taskId, t]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const finishDate = (start: number, duration: number) =>
    days.date(duration === 0 ? start : start + duration - 1);

  const rows: ScheduledTask[] = result.order.map((id) => {
    const task = byId.get(id) as TaskRecord;
    const timing = result.timings.get(id);
    const duration = durationOf(task);
    const es = timing?.earlyStart ?? 0;
    const ls = timing?.lateStart ?? 0;
    const earlyFinish = finishDate(es, duration);
    const base = planned.get(id);
    return {
      taskId: id,
      key: toTask(task).key,
      title: task.title,
      status: task.status,
      durationDays: duration,
      earlyStart: days.date(es),
      earlyFinish,
      lateStart: days.date(ls),
      lateFinish: finishDate(ls, duration),
      totalFloat: timing?.totalFloat ?? 0,
      freeFloat: timing?.freeFloat ?? 0,
      critical: timing?.critical ?? false,
      ...(base
        ? {
            baselineStart: base.start,
            baselineFinish: base.finish,
            startVariance: es - days.index(base.start),
            finishVariance: days.index(earlyFinish) - days.index(base.finish),
          }
        : {}),
    };
  });
  return {
    projectId: project.id,
    projectStart: days.date(0),
    ...(tasks.length ? { projectFinish: days.date(Math.max(result.finish - 1, 0)) } : {}),
    ...(baseline
      ? {
          baseline: {
            number: baseline.number,
            savedAt: baseline.savedAt,
            savedBy: userRef(baseline.savedById),
            taskCount: baseline.tasks.length,
          },
        }
      : {}),
    criticalPath: rows.filter((r) => r.critical).map((r) => r.taskId),
    tasks: rows,
  };
}

/** Task ids → keys, for naming a loop. */
export function keysOf(taskIds: readonly string[]): string[] {
  return taskIds.map((id) => {
    const task = db.state.tasks.find((t) => t.id === id);
    return task ? toTask(task).key : id;
  });
}
