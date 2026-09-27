import {
  DashboardTrendMonth,
  EvmReport,
  EvmSeries,
  EvmSettings,
  Money,
  WbsNode,
} from '../core/api/api.models';
import { plusDays, weekdayIndex } from '../shared/format/iso-week';
import { EvmSettingsRecord } from './data-time';
import { ProjectRecord, WbsNodeRecord } from './data-projects';
import { db } from './db';
import { currencyDigits, fromUnits, toUnits } from './decimal';
import { elapsedDays, evmFigures, ratio } from './evm';
import { orgCurrency, orgToday, wbsTree } from './projects-domain';
import { costOf, rateOn } from './time-domain';

/**
 * Feature 17 as the API implements it (contract 0.6.0): BAC from the WBS, PV spread evenly over
 * each work package's window (the project's start to its target end in this mock), EV by the
 * project's percent-complete method, AC from approved timesheets at the rate of the day worked.
 */

const DEFAULT_SETTINGS = { percentCompleteMethod: 'PHYSICAL', eacMethod: 'TYPICAL' } as const;
const RUNNING = ['IN_PROGRESS', 'ON_HOLD', 'CLOSING'];

export function settingsOf(projectId: string): EvmSettingsRecord {
  return (
    db.state.evmSettings.find((s) => s.projectId === projectId) ?? {
      projectId,
      ...DEFAULT_SETTINGS,
      version: 0,
    }
  );
}

export function toSettings(record: EvmSettingsRecord): EvmSettings {
  return {
    percentCompleteMethod: record.percentCompleteMethod,
    eacMethod: record.eacMethod,
    version: record.version,
  };
}

function workPackages(projectId: string): WbsNodeRecord[] {
  return db.state.wbsNodes.filter((n) => n.projectId === projectId && n.type === 'WORK_PACKAGE');
}

export function bacOf(project: ProjectRecord): bigint {
  return workPackages(project.id).reduce((t, n) => t + toUnits(n.plannedCost), 0n);
}

export function pvOf(project: ProjectRecord, date: string): bigint {
  const [done, total] = elapsedDays(project.startDate, project.targetEndDate, date);
  return (bacOf(project) * done) / total;
}

/** EV by method, or null with the reason when the method has nothing to measure with. */
export function evOf(project: ProjectRecord): { ev: bigint | null; reason?: string } {
  const method = settingsOf(project.id).percentCompleteMethod;
  if (method === 'STORY_POINTS') {
    const pointed = db.state.tasks.filter((t) => t.projectId === project.id && t.storyPoints);
    const total = pointed.reduce((t, x) => t + (x.storyPoints ?? 0), 0);
    if (!total) return { ev: null, reason: 'The project’s tasks have no story points' };
    const done = pointed
      .filter((t) => t.status === 'DONE')
      .reduce((t, x) => t + (x.storyPoints ?? 0), 0);
    return { ev: (bacOf(project) * BigInt(done)) / BigInt(total) };
  }
  // One roll-up of the tree gives every work package's percent complete (reported or from tasks).
  const percents = new Map<string, number>();
  const walk = (nodes: readonly WbsNode[]) =>
    nodes.forEach((n) => {
      percents.set(n.id, n.percentComplete);
      walk(n.children);
    });
  walk(wbsTree(project).nodes);
  const ev = workPackages(project.id).reduce((t, node) => {
    const cost = toUnits(node.plannedCost);
    const percent = percents.get(node.id) ?? 0;
    switch (method) {
      case 'ZERO_HUNDRED':
        return t + (percent >= 100 ? cost : 0n);
      case 'FIFTY_FIFTY':
        return t + (percent >= 100 ? cost : percent > 0 ? cost / 2n : 0n);
      default:
        return t + (cost * BigInt(Math.round(percent * 100))) / 10_000n;
    }
  }, 0n);
  return { ev };
}

/** AC of approved hours up to `date`, and the approved hours that have no rate. */
export function acOf(project: ProjectRecord, date: string): { ac: bigint; unratedHours: number } {
  const approved = new Set(
    db.state.timesheets
      .filter((s) => s.projectId === project.id && s.status === 'APPROVED')
      .map((s) => `${s.userId}|${s.weekStart}`),
  );
  let ac = 0n;
  let unrated = 0;
  for (const entry of db.state.timeEntries) {
    if (entry.projectId !== project.id || entry.date > date) continue;
    const monday = plusDays(entry.date, -weekdayIndex(entry.date));
    if (!approved.has(`${entry.userId}|${monday}`)) continue;
    const rate = rateOn(project.organizationId, entry.userId, entry.date);
    if (rate === undefined) unrated += entry.hours;
    else ac += costOf(entry.hours, rate);
  }
  return { ac, unratedHours: Math.round(unrated * 100) / 100 };
}

function money(units: bigint | undefined, currency: string): Money | undefined {
  return units === undefined
    ? undefined
    : { amount: fromUnits(units, currencyDigits(currency)), currency };
}

export function evmReport(project: ProjectRecord): EvmReport {
  const today = orgToday(project.organizationId);
  const currency = orgCurrency(project.organizationId);
  const settings = settingsOf(project.id);
  const { ev, reason } = evOf(project);
  const { ac, unratedHours } = acOf(project, today);
  const f = evmFigures({
    bac: bacOf(project),
    pv: pvOf(project, today),
    ev,
    ...(reason ? { evMissingReason: reason } : {}),
    ac,
    method: settings.eacMethod,
  });
  const m = (units: bigint | undefined) => money(units, currency);
  const optional = <K extends string, V>(key: K, value: V | undefined) =>
    (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
  return {
    projectId: project.id,
    asOf: today,
    percentCompleteMethod: settings.percentCompleteMethod,
    eacMethod: settings.eacMethod,
    ...optional('bac', m(f.bac)),
    ...optional('pv', m(f.pv)),
    ...optional('ev', m(f.ev)),
    ...optional('ac', m(f.ac)),
    ...optional('sv', m(f.sv)),
    ...optional('cv', m(f.cv)),
    ...optional('spi', f.spi),
    ...optional('cpi', f.cpi),
    ...optional('eac', m(f.eac)),
    ...optional('etc', m(f.etc)),
    ...optional('vac', m(f.vac)),
    ...optional('tcpi', f.tcpi),
    unratedHours,
    unavailable: f.unavailable,
  };
}

/** SPI and CPI for the health rule and the dashboard (running projects only). */
export function indicesOf(project: ProjectRecord): { spi?: number; cpi?: number } {
  if (!RUNNING.includes(project.status)) return {};
  const report = evmReport(project);
  return {
    ...(report.spi !== undefined ? { spi: report.spi } : {}),
    ...(report.cpi !== undefined ? { cpi: report.cpi } : {}),
  };
}

const sundayOf = (date: string) => plusDays(date, 6 - weekdayIndex(date));

/** Weekly cumulative PV (every week), AC (up to today) and EV (snapshots, and today). */
export function evmSeries(project: ProjectRecord, from?: string, to?: string): EvmSeries {
  const today = orgToday(project.organizationId);
  const currency = orgCurrency(project.organizationId);
  const first = sundayOf(from ?? project.startDate);
  const last = sundayOf(to ?? project.targetEndDate);
  const thisWeek = sundayOf(today);
  ensureSnapshots();
  const snapshots = new Map(
    db.state.evmSnapshots
      .filter((s) => s.projectId === project.id)
      .map((s) => [s.weekEnding, s.ev]),
  );
  const current = evOf(project).ev;
  const points = [];
  for (let sunday = first; sunday <= last && points.length < 104; sunday = plusDays(sunday, 7)) {
    const asOf = sunday < today ? sunday : today;
    const snapshot =
      sunday === thisWeek
        ? current
        : snapshots.has(sunday)
          ? toUnits(snapshots.get(sunday) as string)
          : null;
    points.push({
      weekEnding: sunday,
      pv: money(pvOf(project, sunday), currency) as Money,
      ...(sunday <= thisWeek && snapshot !== null ? { ev: money(snapshot, currency) } : {}),
      ...(sunday <= thisWeek ? { ac: money(acOf(project, asOf).ac, currency) } : {}),
    });
  }
  return { projectId: project.id, bac: money(bacOf(project), currency) as Money, points };
}

/**
 * The demo's history: a snapshot every past Sunday of each running project, as if EV had tracked
 * the plan at today's efficiency (so the S-curve has a past).
 */
export function ensureSnapshots(): void {
  if (db.state.evmSnapshotsSeeded) return;
  db.state.evmSnapshotsSeeded = true;
  for (const project of db.state.projects) {
    if (!RUNNING.includes(project.status)) continue;
    const today = orgToday(project.organizationId);
    const pvToday = pvOf(project, today);
    const ev = evOf(project).ev;
    if (!pvToday || ev === null) continue;
    for (
      let sunday = sundayOf(project.startDate);
      sunday < mondayOfToday(today);
      sunday = plusDays(sunday, 7)
    ) {
      db.state.evmSnapshots.push({
        projectId: project.id,
        weekEnding: sunday,
        ev: fromUnits((ev * pvOf(project, sunday)) / pvToday, 4),
      });
    }
  }
}

function mondayOfToday(today: string): string {
  return plusDays(today, -weekdayIndex(today));
}

/** Monthly PV, EV and AC over projects, oldest first, from each project's last snapshot in the month. */
export function trends(projects: readonly ProjectRecord[], months: number, organizationId: string) {
  const today = orgToday(organizationId);
  const currency = orgCurrency(organizationId);
  ensureSnapshots();
  const result: DashboardTrendMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - i);
    const month = date.toISOString().slice(0, 7);
    const monthEnd = plusDays(
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
        .toISOString()
        .slice(0, 10),
      -1,
    );
    const asOf = monthEnd < today ? monthEnd : today;
    let pv = 0n;
    let ev = 0n;
    let ac = 0n;
    for (const project of projects) {
      const snapshots = db.state.evmSnapshots.filter(
        (s) => s.projectId === project.id && s.weekEnding.startsWith(month),
      );
      const last = snapshots.sort((a, b) => b.weekEnding.localeCompare(a.weekEnding))[0];
      const earned =
        month === today.slice(0, 7) && RUNNING.includes(project.status)
          ? evOf(project).ev
          : last
            ? toUnits(last.ev)
            : null;
      if (earned === null) continue;
      const at = month === today.slice(0, 7) ? asOf : (last?.weekEnding ?? asOf);
      pv += pvOf(project, at);
      ev += earned;
      ac += acOf(project, at).ac;
    }
    result.push({
      month,
      pv: money(pv, currency) as Money,
      ev: money(ev, currency) as Money,
      ac: money(ac, currency) as Money,
      ...(pv ? { spi: ratio(ev, pv) } : {}),
      ...(ac ? { cpi: ratio(ev, ac) } : {}),
    });
  }
  return { months: result };
}
