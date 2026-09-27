import { http } from 'msw';
import { EAC_METHODS, PERCENT_COMPLETE_METHODS } from '../../core/api/api.models';
import { mondayOf, plusDays, weekdayIndex } from '../../shared/format/iso-week';
import { MembershipRecord } from '../data';
import { db } from '../db';
import {
  ensureSnapshots,
  evmReport,
  evmSeries,
  settingsOf,
  toSettings,
  trends,
} from '../evm-domain';
import {
  API,
  Reply,
  Validator,
  checkPathId,
  checkVersion,
  etag,
  ifMatchVersion,
  invalidBody,
  latency,
  readBody,
  reply,
  requireRole,
} from '../http';
import { orgToday, visibleProjects } from '../projects-domain';
import { calendarOf, toCalendar } from '../schedule-domain';
import { heatmap, toAllocation, toCapacity } from '../time-domain';
import { manages } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';
import { orgUser } from './timesheet.handlers';

const PLANNERS = ['ORG_ADMIN', 'PMO', 'PROJECT_MANAGER'];
const KEEPERS = ['ORG_ADMIN', 'PMO'];

/** The person themself, or one of `roles` (403 otherwise). */
function selfOr(r: Reply, membership: MembershipRecord, userId: string, roles: readonly string[]) {
  return membership.userId === userId || roles.includes(membership.role)
    ? null
    : r.problem(403, 'access.denied');
}

/** Easter Sunday (Gregorian), for Good Friday and Easter Monday. */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Rwanda's public holidays of a year (Eid al-Fitr and Eid al-Adha are added by hand). */
export function rwandaHolidays(year: number): { date: string; name: string }[] {
  const d = (md: string) => `${year}-${md}`;
  const sunday = easter(year);
  const firstOfAugust = d('08-01');
  // The first Friday of August: weekdayIndex counts Monday as 0, so Friday is 4.
  const umuganura = plusDays(firstOfAugust, (4 - weekdayIndex(firstOfAugust) + 7) % 7);
  return [
    { date: d('01-01'), name: 'New Year’s Day' },
    { date: d('01-02'), name: 'Day after New Year’s Day' },
    { date: d('02-01'), name: 'National Heroes’ Day' },
    { date: plusDays(sunday, -2), name: 'Good Friday' },
    { date: plusDays(sunday, 1), name: 'Easter Monday' },
    { date: d('04-07'), name: 'Genocide against the Tutsi Memorial Day' },
    { date: d('05-01'), name: 'Labour Day' },
    { date: d('07-01'), name: 'Independence Day' },
    { date: d('07-04'), name: 'Liberation Day' },
    { date: umuganura, name: 'Umuganura Day' },
    { date: d('08-15'), name: 'Assumption Day' },
    { date: d('12-25'), name: 'Christmas Day' },
    { date: d('12-26'), name: 'Boxing Day' },
  ];
}

export const resourceHandlers = [
  http.get(`${API}/resources/heatmap`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const v = new Validator();
    v.date('from', url.searchParams.get('from') ?? undefined);
    v.date('to', url.searchParams.get('to') ?? undefined);
    const projectId = url.searchParams.get('projectId') ?? undefined;
    v.uuid('projectId', projectId);
    if (!v.ok) return v.problem(r);
    const today = orgToday(membership.organizationId);
    const from = mondayOf(url.searchParams.get('from') ?? today);
    const to = mondayOf(url.searchParams.get('to') ?? plusDays(from, 11 * 7));
    const weeks = (Date.parse(to) - Date.parse(from)) / (7 * 86_400_000) + 1;
    const range = new Validator();
    if (to < from) range.add('to', 'invalid', 'must not be before from');
    else if (weeks > 26) range.add('to', 'range', 'at most 26 weeks', { max: 26 });
    if (!range.ok) return range.problem(r);

    let people = db.state.memberships
      .filter((m) => m.organizationId === membership.organizationId)
      .map((m) => m.userId);
    if (projectId) {
      const project = visibleProject(r, membership, projectId);
      if (project instanceof Response) return project;
      const team = new Set([
        project.managerId,
        ...db.state.projectMembers.filter((m) => m.projectId === project.id).map((m) => m.userId),
      ]);
      people = people.filter((p) => team.has(p));
    }
    if (!PLANNERS.includes(membership.role)) {
      people = people.filter((p) => p === membership.userId);
    }
    return r.json(heatmap(membership.organizationId, people, from, to));
  }),

  http.get(`${API}/projects/:projectId/allocations`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const v = new Validator();
    v.date('from', url.searchParams.get('from') ?? undefined);
    v.date('to', url.searchParams.get('to') ?? undefined);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    return r.json(
      db.state.allocations
        .filter(
          (a) =>
            a.projectId === project.id &&
            (!from || a.weekStart >= mondayOf(from)) &&
            (!to || a.weekStart <= to),
        )
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map(toAllocation),
    );
  }),

  http.put(`${API}/projects/:projectId/allocations`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const list = body['allocations'];
    if (!Array.isArray(list)) v.add('allocations', 'required', 'allocations is required');
    else if (list.length > 500) v.add('allocations', 'length', 'at most 500', { max: 500 });
    else {
      list.forEach((raw: unknown, i) => {
        const a = (raw ?? {}) as Record<string, unknown>;
        v.uuid(`allocations[${i}].userId`, a['userId'], true);
        if (v.date(`allocations[${i}].weekStart`, a['weekStart'], true)) {
          if (weekdayIndex(String(a['weekStart'])) !== 0) {
            v.add(`allocations[${i}].weekStart`, 'invalid', 'must be a Monday');
          }
        }
        if (typeof a['hours'] !== 'number')
          v.add(`allocations[${i}].hours`, 'required', 'required');
        else v.number(`allocations[${i}].hours`, a['hours'], 0, 168);
      });
    }
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const input = list as { userId: string; weekStart: string; hours: number }[];
    const domain = new Validator();
    input.forEach((a, i) => {
      if (
        !db.state.memberships.some(
          (m) => m.organizationId === project.organizationId && m.userId === a.userId,
        )
      ) {
        domain.add(`allocations[${i}].userId`, 'invalid', 'is not a member of this organization');
      }
    });
    if (!domain.ok) return domain.problem(r);

    for (const a of input) {
      db.state.allocations = db.state.allocations.filter(
        (x) =>
          !(x.projectId === project.id && x.userId === a.userId && x.weekStart === a.weekStart),
      );
      if (a.hours > 0) {
        db.state.allocations.push({
          userId: a.userId,
          projectId: project.id,
          weekStart: a.weekStart,
          hours: a.hours,
        });
      }
    }
    db.save();
    return r.json(
      db.state.allocations
        .filter((a) => a.projectId === project.id)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map(toAllocation),
    );
  }),

  http.get(`${API}/users/:userId/capacity`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const userId = orgUser(r, membership, params['userId']);
    if (userId instanceof Response) return userId;
    const denied = selfOr(r, membership, userId, PLANNERS);
    if (denied) return denied;
    return r.json(
      toCapacity(membership.organizationId, userId, orgToday(membership.organizationId)),
    );
  }),

  http.put(`${API}/users/:userId/capacity`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    if (typeof body['hoursPerWeek'] !== 'number') {
      v.add('hoursPerWeek', 'required', 'hoursPerWeek is required');
    } else v.number('hoursPerWeek', body['hoursPerWeek'], 0, 80);
    v.date('validFrom', body['validFrom'], true);
    if (!v.ok) return v.problem(r);
    const userId = orgUser(r, membership, params['userId']);
    if (userId instanceof Response) return userId;
    const denied = requireRole(r, membership.role, ['ORG_ADMIN', 'PMO']);
    if (denied) return denied;
    const validFrom = String(body['validFrom']);
    db.state.capacities = [
      ...db.state.capacities.filter(
        (c) =>
          !(
            c.organizationId === membership.organizationId &&
            c.userId === userId &&
            c.validFrom === validFrom
          ),
      ),
      {
        organizationId: membership.organizationId,
        userId,
        hoursPerWeek: Number(body['hoursPerWeek']),
        validFrom,
      },
    ];
    db.save();
    return r.json(
      toCapacity(membership.organizationId, userId, orgToday(membership.organizationId)),
    );
  }),

  http.post(`${API}/users/:userId/leave`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.date('from', body['from'], true);
    v.date('to', body['to'], true);
    if (body['reason'] !== undefined) v.string('reason', body['reason'], 0, 200, false);
    if (v.ok && String(body['to']) < String(body['from'])) {
      v.add('to', 'invalid', 'must not be before from');
    }
    if (!v.ok) return v.problem(r);
    const userId = orgUser(r, membership, params['userId']);
    if (userId instanceof Response) return userId;
    const denied = selfOr(r, membership, userId, KEEPERS);
    if (denied) return denied;
    const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
    const leave = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      userId,
      from: String(body['from']),
      to: String(body['to']),
      ...(reason ? { reason } : {}),
    };
    db.state.leave.push(leave);
    db.save();
    return r.json(
      { id: leave.id, userId, from: leave.from, to: leave.to, ...(reason ? { reason } : {}) },
      201,
    );
  }),

  http.delete(`${API}/leave/:leaveId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'leaveId', params['leaveId']);
    if (badId) return badId;
    const leave = db.state.leave.find(
      (l) => l.id === params['leaveId'] && l.organizationId === membership.organizationId,
    );
    if (!leave) return r.problem(404, 'resource.not_found');
    const denied = selfOr(r, membership, leave.userId, KEEPERS);
    if (denied) return denied;
    db.state.leave = db.state.leave.filter((l) => l !== leave);
    db.save();
    return r.empty(204);
  }),

  http.post(`${API}/organization/calendar/public-holidays`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('country', body['country'], ['RW'] as const);
    const year = body['year'];
    if (typeof year !== 'number' || !Number.isInteger(year)) {
      v.add('year', 'required', 'year is required');
    } else v.number('year', year, 2000, 2100);
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;
    const current = calendarOf(membership.organizationId);
    const stale = checkVersion(r, sent, current.version);
    if (stale) return stale;
    const listed = new Set(current.holidays.map((h) => h.date));
    const saved = {
      ...current,
      holidays: [
        ...current.holidays,
        ...rwandaHolidays(Number(year)).filter((h) => !listed.has(h.date)),
      ].sort((a, b) => a.date.localeCompare(b.date)),
      version: current.version + 1,
    };
    db.state.calendars = [
      ...db.state.calendars.filter((c) => c.organizationId !== membership.organizationId),
      saved,
    ];
    db.save();
    return r.json(toCalendar(saved), 200, etag(saved.version));
  }),

  http.get(`${API}/projects/:projectId/evm`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(evmReport(project));
  }),

  http.get(`${API}/projects/:projectId/evm/series`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const v = new Validator();
    v.date('from', url.searchParams.get('from') ?? undefined);
    v.date('to', url.searchParams.get('to') ?? undefined);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(
      evmSeries(
        project,
        url.searchParams.get('from') ?? undefined,
        url.searchParams.get('to') ?? undefined,
      ),
    );
  }),

  http.get(`${API}/projects/:projectId/evm/settings`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const settings = settingsOf(project.id);
    return r.json(toSettings(settings), 200, etag(settings.version));
  }),

  http.put(`${API}/projects/:projectId/evm/settings`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('percentCompleteMethod', body['percentCompleteMethod'], PERCENT_COMPLETE_METHODS);
    v.oneOf('eacMethod', body['eacMethod'], EAC_METHODS);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const current = settingsOf(project.id);
    const stale = checkVersion(r, sent, current.version);
    if (stale) return stale;
    const saved = {
      projectId: project.id,
      percentCompleteMethod: body['percentCompleteMethod'] as typeof current.percentCompleteMethod,
      eacMethod: body['eacMethod'] as typeof current.eacMethod,
      version: current.version + 1,
    };
    db.state.evmSettings = [
      ...db.state.evmSettings.filter((s) => s.projectId !== project.id),
      saved,
    ];
    db.save();
    return r.json(toSettings(saved), 200, etag(saved.version));
  }),

  http.get(`${API}/dashboard/trends`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const portfolioId = url.searchParams.get('portfolioId') ?? undefined;
    const months = Number(url.searchParams.get('months') ?? 6);
    const v = new Validator();
    v.uuid('portfolioId', portfolioId);
    if (!Number.isInteger(months)) v.add('months', 'invalid', 'must be a whole number');
    else v.number('months', months, 1, 24);
    if (!v.ok) return v.problem(r);
    ensureSnapshots();
    const projects = visibleProjects(membership).filter(
      (p) => !portfolioId || p.portfolioId === portfolioId,
    );
    return r.json(trends(projects, months, membership.organizationId));
  }),
];
