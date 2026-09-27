import { http } from 'msw';
import { DAYS_OF_WEEK, DEPENDENCY_TYPES, DependencyType } from '../../core/api/api.models';
import { ProjectRecord } from '../data-projects';
import { BaselineRecord, DependencyRecord } from '../data-schedule';
import { CycleError, loopClosedBy } from '../cpm';
import { db } from '../db';
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
import { canSee } from '../projects-domain';
import { calendarOf, keysOf, linksOf, scheduleOf, toCalendar } from '../schedule-domain';
import { manages, tasksOf } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

function toDependency(record: DependencyRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    predecessorId: record.predecessorId,
    successorId: record.successorId,
    type: record.type,
    lagDays: record.lagDays,
    createdAt: record.createdAt,
  };
}

/** 409 `schedule.cycle` naming the loop by task keys in `errors[0].params.cycle`. */
function cycle(r: Reply, loop: readonly string[], field: string): Response {
  const named = keysOf(loop);
  return r.problem(409, 'schedule.cycle', {
    detail: `The dependencies would form a loop: ${named.join(' → ')}`,
    errors: [
      {
        field,
        code: 'schedule.cycle',
        message: `would close the loop ${named.join(' → ')}`,
        params: { cycle: named },
      },
    ],
  });
}

function notPredictive(r: Reply, project: ProjectRecord): Response | null {
  return project.methodology === 'AGILE' ? r.problem(409, 'schedule.not_predictive') : null;
}

export const scheduleHandlers = [
  http.get(`${API}/projects/:projectId/dependencies`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(
      db.state.dependencies
        .filter((d) => d.projectId === project.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toDependency),
    );
  }),

  http.post(`${API}/projects/:projectId/dependencies`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.uuid('predecessorId', body['predecessorId'], true);
    v.uuid('successorId', body['successorId'], true);
    if (body['type'] !== undefined) v.oneOf('type', body['type'], DEPENDENCY_TYPES);
    const lag = body['lagDays'];
    if (lag !== undefined && lag !== null) {
      if (typeof lag !== 'number' || !Number.isInteger(lag))
        v.add('lagDays', 'invalid', 'must be a whole number');
      else v.number('lagDays', lag, -365, 365);
    }
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const agile = notPredictive(r, project);
    if (agile) return agile;

    const ids = new Set(tasksOf(project.id).map((t) => t.id));
    const predecessorId = String(body['predecessorId']);
    const successorId = String(body['successorId']);
    const domain = new Validator();
    if (!ids.has(predecessorId))
      domain.add('predecessorId', 'invalid', 'must be a task of this project');
    if (!ids.has(successorId))
      domain.add('successorId', 'invalid', 'must be a task of this project');
    if (domain.ok && predecessorId === successorId) {
      domain.add('successorId', 'invalid', 'a task cannot depend on itself');
    }
    if (!domain.ok) return domain.problem(r);
    if (
      db.state.dependencies.some(
        (d) => d.predecessorId === predecessorId && d.successorId === successorId,
      )
    ) {
      return r.problem(409, 'schedule.dependency_exists');
    }
    const loop = loopClosedBy(linksOf(project.id), predecessorId, successorId);
    if (loop) return cycle(r, loop, 'successorId');

    const record: DependencyRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      predecessorId,
      successorId,
      type: (body['type'] as DependencyType | undefined) ?? 'FS',
      lagDays: typeof lag === 'number' ? lag : 0,
      createdAt: new Date().toISOString(),
    };
    db.state.dependencies.push(record);
    db.save();
    return r.json(toDependency(record), 201, { Location: `/api/v1/dependencies/${record.id}` });
  }),

  http.delete(`${API}/dependencies/:dependencyId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'dependencyId', params['dependencyId']);
    if (badId) return badId;
    const dependency = db.state.dependencies.find((d) => d.id === params['dependencyId']);
    const project = dependency && db.state.projects.find((p) => p.id === dependency.projectId);
    if (!dependency || !project || !canSee(project, membership)) {
      return r.problem(404, 'resource.not_found');
    }
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    db.state.dependencies = db.state.dependencies.filter((d) => d !== dependency);
    db.save();
    return r.empty(204);
  }),

  http.get(`${API}/projects/:projectId/schedule`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    try {
      return r.json(scheduleOf(project));
    } catch (error: unknown) {
      if (error instanceof CycleError) return cycle(r, error.cycle, 'dependencies');
      throw error;
    }
  }),

  http.post(`${API}/projects/:projectId/schedule/baseline`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const agile = notPredictive(r, project);
    if (agile) return agile;
    let schedule;
    try {
      schedule = scheduleOf(project);
    } catch (error: unknown) {
      if (error instanceof CycleError) return cycle(r, error.cycle, 'dependencies');
      throw error;
    }
    const previous = db.state.baselines.filter((b) => b.projectId === project.id);
    const record: BaselineRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number: Math.max(0, ...previous.map((b) => b.number)) + 1,
      savedAt: new Date().toISOString(),
      savedById: membership.userId,
      tasks: schedule.tasks.map((t) => ({
        taskId: t.taskId,
        start: t.earlyStart,
        finish: t.earlyFinish,
      })),
    };
    db.state.baselines.push(record);
    db.save();
    return r.json(
      {
        number: record.number,
        savedAt: record.savedAt,
        savedBy: {
          userId: membership.userId,
          fullName: db.user(membership.userId)?.fullName ?? '',
        },
        taskCount: record.tasks.length,
      },
      201,
    );
  }),

  http.get(`${API}/organization/calendar`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const calendar = calendarOf(membership.organizationId);
    return r.json(toCalendar(calendar), 200, etag(calendar.version));
  }),

  http.put(`${API}/organization/calendar`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const workingDays = body['workingDays'];
    if (!Array.isArray(workingDays)) v.add('workingDays', 'required', 'workingDays is required');
    else if (workingDays.length < 1 || workingDays.length > 7) {
      v.add('workingDays', 'length', 'between 1 and 7 days', { min: 1, max: 7 });
    } else workingDays.forEach((d: unknown, i) => v.oneOf(`workingDays[${i}]`, d, DAYS_OF_WEEK));
    const holidays = body['holidays'];
    if (!Array.isArray(holidays)) v.add('holidays', 'required', 'holidays is required');
    else if (holidays.length > 200) v.add('holidays', 'length', 'at most 200', { max: 200 });
    else {
      holidays.forEach((h: unknown, i) => {
        const holiday = (h ?? {}) as Record<string, unknown>;
        v.date(`holidays[${i}].date`, holiday['date'], true);
        v.string(`holidays[${i}].name`, holiday['name'], 1, 100);
      });
    }
    if (!v.ok) return v.problem(r);
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;
    const current = calendarOf(membership.organizationId);
    const stale = checkVersion(r, sent, current.version);
    if (stale) return stale;
    const list = holidays as { date: string; name: string }[];
    const dates = list.map((h) => h.date);
    const duplicate = dates.find((d, i) => dates.indexOf(d) !== i);
    if (duplicate) {
      const domain = new Validator();
      domain.add('holidays', 'invalid', `${duplicate} is listed twice`);
      return domain.problem(r);
    }

    const saved = {
      organizationId: membership.organizationId,
      workingDays: DAYS_OF_WEEK.filter((d) => (workingDays as string[]).includes(d)),
      holidays: list
        .map((h) => ({ date: h.date, name: h.name.trim() }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      version: current.version + 1,
    };
    db.state.calendars = [
      ...db.state.calendars.filter((c) => c.organizationId !== membership.organizationId),
      saved,
    ];
    db.save();
    return r.json(toCalendar(saved), 200, etag(saved.version));
  }),
];
