import { http } from 'msw';
import { TIMESHEET_STATUSES, TimesheetStatus } from '../../core/api/api.models';
import { isValidWeek, isoWeekOf, plusDays, weekStartOf } from '../../shared/format/iso-week';
import { MembershipRecord } from '../data';
import { CostRateRecord, TimeEntryRecord, TimesheetRecord } from '../data-time';
import { db } from '../db';
import { currencyDigits } from '../decimal';
import {
  API,
  Reply,
  Validator,
  checkPathId,
  invalidBody,
  latency,
  paging,
  readBody,
  reply,
  sortAndPage,
} from '../http';
import { canSee, orgCurrency, orgToday } from '../projects-domain';
import {
  canDecide,
  entriesOf,
  isOpen,
  sheetsOf,
  timesheetWeek,
  toSummary,
  toTimesheet,
  worksOn,
} from '../time-domain';
import { manages } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

/** The week in the path or query as a Monday, or a 400 on `week`. */
function weekParam(r: Reply, week: unknown): string | Response {
  if (typeof week !== 'string' || !isValidWeek(week)) {
    const v = new Validator();
    v.add('week', 'format', 'must be an ISO week like 2026-W40');
    return v.problem(r);
  }
  return weekStartOf(week);
}

/** A sheet the caller may read: its owner or the project's managers (404 for anyone else). */
function readableSheet(
  r: Reply,
  membership: MembershipRecord,
  timesheetId: unknown,
): TimesheetRecord | Response {
  const badId = checkPathId(r, 'timesheetId', timesheetId);
  if (badId) return badId;
  const sheet = db.state.timesheets.find((s) => s.id === timesheetId);
  const project = sheet && db.state.projects.find((p) => p.id === sheet.projectId);
  if (
    !sheet ||
    !project ||
    project.organizationId !== membership.organizationId ||
    (sheet.userId !== membership.userId && !manages(project, membership))
  ) {
    return r.problem(404, 'resource.not_found');
  }
  return sheet;
}

function toCostRate(rate: CostRateRecord) {
  return {
    id: rate.id,
    userId: rate.userId,
    hourlyRate: rate.hourlyRate,
    validFrom: rate.validFrom,
    createdAt: rate.createdAt,
  };
}

/** The entries of a locked sheet must come back unchanged. */
const signature = (e: Pick<TimeEntryRecord, 'taskId' | 'date' | 'hours' | 'note' | 'billable'>) =>
  `${e.taskId}|${e.date}|${e.hours}|${e.note ?? ''}|${e.billable}`;

/** Approve or reject: the project's managers, never the owner, and only a submitted sheet. */
function decide(r: Reply, membership: MembershipRecord, sheet: TimesheetRecord): Response | null {
  if (sheet.userId === membership.userId) return r.problem(409, 'timesheets.self_approval');
  if (!canDecide(sheet, membership)) return r.problem(403, 'access.denied');
  if (sheet.status !== 'SUBMITTED') return r.problem(409, 'timesheets.not_submitted');
  return null;
}

export const timesheetHandlers = [
  http.get(`${API}/timesheets/me`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const week =
      new URL(request.url).searchParams.get('week') ??
      isoWeekOf(orgToday(membership.organizationId));
    const monday = weekParam(r, week);
    if (monday instanceof Response) return monday;
    return r.json(timesheetWeek(membership, monday));
  }),

  http.put(`${API}/timesheets/me/:week/entries`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const monday = weekParam(r, params['week']);
    if (monday instanceof Response) return monday;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const list = body['entries'];
    if (!Array.isArray(list)) v.add('entries', 'required', 'entries is required');
    else if (list.length > 500) v.add('entries', 'length', 'at most 500', { max: 500 });
    else {
      list.forEach((raw: unknown, i) => {
        const e = (raw ?? {}) as Record<string, unknown>;
        v.uuid(`entries[${i}].taskId`, e['taskId'], true);
        v.date(`entries[${i}].date`, e['date'], true);
        const hours = e['hours'];
        if (typeof hours !== 'number' || hours < 0.25 || hours > 24 || (hours * 4) % 1 !== 0) {
          v.add(`entries[${i}].hours`, 'invalid', 'quarter hours from 0.25 to 24');
        }
        if (e['note'] !== undefined) v.string(`entries[${i}].note`, e['note'], 0, 500, false);
        if (e['billable'] !== undefined && typeof e['billable'] !== 'boolean') {
          v.add(`entries[${i}].billable`, 'invalid', 'must be true or false');
        }
      });
    }
    if (!v.ok) return v.problem(r);
    const input = list as Record<string, unknown>[];
    const sunday = plusDays(monday, 6);
    const domain = new Validator();
    input.forEach((e, i) => {
      const date = String(e['date']);
      if (date < monday || date > sunday) {
        domain.add(`entries[${i}].date`, 'invalid', `must be in the week ${isoWeekOf(monday)}`);
      }
    });
    if (!domain.ok) return domain.problem(r);

    // Tasks: visible (404 otherwise) and of projects the caller works on (403 otherwise).
    const tasks = new Map<string, TimeEntryRecord>();
    for (const e of input) {
      const task = db.state.tasks.find((t) => t.id === e['taskId']);
      const project = task && db.state.projects.find((p) => p.id === task.projectId);
      if (!task || !project || !canSee(project, membership)) {
        return r.problem(404, 'resource.not_found');
      }
      if (!worksOn(project, membership.userId)) return r.problem(403, 'access.denied');
      tasks.set(task.id, {
        id: '',
        userId: membership.userId,
        projectId: project.id,
        taskId: task.id,
        taskKey: `${project.code}-${task.number}`,
        taskTitle: task.title,
        date: '',
        hours: 0,
        billable: false,
      });
    }

    const sheets = sheetsOf(membership.userId, membership.organizationId, monday);
    const locked = new Set(sheets.filter((s) => !isOpen(s.status)).map((s) => s.projectId));
    const current = db.state.timeEntries.filter(
      (e) => e.userId === membership.userId && e.date >= monday && e.date <= sunday,
    );
    // A submitted or approved project's entries must come back as they are.
    for (const projectId of locked) {
      const before = current
        .filter((e) => e.projectId === projectId)
        .map(signature)
        .sort();
      const after = input
        .filter((e) => tasks.get(String(e['taskId']))?.projectId === projectId)
        .map((e) =>
          signature({
            taskId: String(e['taskId']),
            date: String(e['date']),
            hours: Number(e['hours']),
            note: typeof e['note'] === 'string' && e['note'] ? e['note'] : undefined,
            billable: e['billable'] === true,
          }),
        )
        .sort();
      if (before.join(',') !== after.join(',')) return r.problem(409, 'timesheets.locked');
    }
    // Every day at most 24 hours over all projects.
    const perDay = new Map<string, number>();
    input.forEach((e) =>
      perDay.set(String(e['date']), (perDay.get(String(e['date'])) ?? 0) + Number(e['hours'])),
    );
    const over = [...perDay.entries()].find(([, hours]) => hours > 24);
    if (over) {
      const tooMuch = new Validator();
      tooMuch.add(
        'entries',
        'invalid',
        `${over[0]} totals ${over[1]} hours; a day has at most 24`,
        {
          date: over[0],
          hours: over[1],
        },
      );
      return tooMuch.problem(r);
    }

    const kept = db.state.timeEntries.filter(
      (e) =>
        !(e.userId === membership.userId && e.date >= monday && e.date <= sunday) ||
        locked.has(e.projectId),
    );
    const added: TimeEntryRecord[] = input
      .filter((e) => !locked.has(tasks.get(String(e['taskId']))?.projectId ?? ''))
      .map((e) => {
        const base = tasks.get(String(e['taskId'])) as TimeEntryRecord;
        return {
          ...base,
          id: crypto.randomUUID(),
          date: String(e['date']),
          hours: Number(e['hours']),
          ...(typeof e['note'] === 'string' && e['note'].trim() ? { note: e['note'].trim() } : {}),
          billable: e['billable'] === true,
        };
      });
    db.state.timeEntries = [...kept, ...added];
    // Each project with entries has a sheet; empty drafts go away.
    for (const projectId of new Set(added.map((e) => e.projectId))) {
      if (!sheets.some((s) => s.projectId === projectId)) {
        db.state.timesheets.push({
          id: crypto.randomUUID(),
          userId: membership.userId,
          projectId,
          weekStart: monday,
          status: 'DRAFT',
        });
      }
    }
    db.state.timesheets = db.state.timesheets.filter(
      (s) =>
        !(
          s.userId === membership.userId &&
          s.weekStart === monday &&
          s.status === 'DRAFT' &&
          !added.some((e) => e.projectId === s.projectId)
        ),
    );
    db.save();
    return r.json(timesheetWeek(membership, monday));
  }),

  http.post(`${API}/timesheets/me/:week/submit`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const monday = weekParam(r, params['week']);
    if (monday instanceof Response) return monday;
    const ready = sheetsOf(membership.userId, membership.organizationId, monday).filter(
      (s) => isOpen(s.status) && entriesOf(s).length > 0,
    );
    if (!ready.length) return r.problem(409, 'timesheets.empty');
    const now = new Date().toISOString();
    for (const sheet of ready) {
      sheet.status = 'SUBMITTED';
      sheet.submittedAt = now;
      delete sheet.decidedById;
      delete sheet.decidedAt;
      delete sheet.comment;
    }
    db.save();
    return r.json(timesheetWeek(membership, monday));
  }),

  http.get(`${API}/projects/:projectId/timesheets`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const week = url.searchParams.get('week') ?? undefined;
    const v = new Validator();
    v.oneOf('status', status, TIMESHEET_STATUSES, false);
    if (week !== undefined && !isValidWeek(week)) v.add('week', 'format', 'an ISO week');
    const page = paging(url, ['weekStart'], 'weekStart,asc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');

    const monday = week ? weekStartOf(week) : undefined;
    const sheets = db.state.timesheets
      .filter(
        (s) =>
          s.projectId === project.id &&
          (!status || s.status === (status as TimesheetStatus)) &&
          (!monday || s.weekStart === monday),
      )
      .map(toSummary);
    return r.json(sortAndPage(sheets, page, { weekStart: (s) => s.weekStart }));
  }),

  http.get(`${API}/timesheets/:timesheetId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sheet = readableSheet(r, membership, params['timesheetId']);
    if (sheet instanceof Response) return sheet;
    return r.json(toTimesheet(sheet));
  }),

  http.post(`${API}/timesheets/:timesheetId/approve`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sheet = readableSheet(r, membership, params['timesheetId']);
    if (sheet instanceof Response) return sheet;
    const refused = decide(r, membership, sheet);
    if (refused) return refused;
    sheet.status = 'APPROVED';
    sheet.decidedById = membership.userId;
    sheet.decidedAt = new Date().toISOString();
    delete sheet.comment;
    db.save();
    return r.json(toTimesheet(sheet));
  }),

  http.post(`${API}/timesheets/:timesheetId/reject`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('comment', body['comment'], 1, 1000);
    if (!v.ok) return v.problem(r);
    const sheet = readableSheet(r, membership, params['timesheetId']);
    if (sheet instanceof Response) return sheet;
    const refused = decide(r, membership, sheet);
    if (refused) return refused;
    sheet.status = 'REJECTED';
    sheet.decidedById = membership.userId;
    sheet.decidedAt = new Date().toISOString();
    sheet.comment = String(body['comment']).trim();
    db.save();
    return r.json(toTimesheet(sheet));
  }),

  http.get(`${API}/users/:userId/cost-rates`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const target = orgUser(r, membership, params['userId']);
    if (target instanceof Response) return target;
    if (membership.role !== 'ORG_ADMIN' && membership.role !== 'PMO') {
      return r.problem(403, 'access.denied');
    }
    return r.json(
      db.state.costRates
        .filter((c) => c.organizationId === membership.organizationId && c.userId === target)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
        .map(toCostRate),
    );
  }),

  http.post(`${API}/users/:userId/cost-rates`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const currency = orgCurrency(membership.organizationId);
    const v = new Validator();
    if (body['hourlyRate'] === undefined) v.add('hourlyRate', 'required', 'hourlyRate is required');
    else v.money('hourlyRate', body['hourlyRate'], currency, currencyDigits(currency));
    v.date('validFrom', body['validFrom'], true);
    if (!v.ok) return v.problem(r);
    const target = orgUser(r, membership, params['userId']);
    if (target instanceof Response) return target;
    if (membership.role !== 'ORG_ADMIN' && membership.role !== 'PMO') {
      return r.problem(403, 'access.denied');
    }
    const amount = (body['hourlyRate'] as { amount: string }).amount;
    if (amount.startsWith('-')) {
      const domain = new Validator();
      domain.add('hourlyRate.amount', 'invalid', 'must not be negative');
      return domain.problem(r);
    }
    const rate = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      userId: target,
      hourlyRate: { amount, currency },
      validFrom: String(body['validFrom']),
      createdAt: new Date().toISOString(),
    };
    db.state.costRates.push(rate);
    db.save();
    return r.json(toCostRate(rate), 201);
  }),
];

/** A member of the caller's organization, by id (404 otherwise). */
export function orgUser(
  r: Reply,
  membership: MembershipRecord,
  userId: unknown,
): string | Response {
  const badId = checkPathId(r, 'userId', userId);
  if (badId) return badId;
  return db.state.memberships.some(
    (m) => m.organizationId === membership.organizationId && m.userId === userId,
  )
    ? String(userId)
    : r.problem(404, 'resource.not_found');
}
