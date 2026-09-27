import { http } from 'msw';
import { CARRY_OVER_TO_BACKLOG } from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { ProjectRecord } from '../data-projects';
import { SprintRecord } from '../data-work';
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
  paging,
  readBody,
  reply,
  sortAndPage,
} from '../http';
import { canSee, orgToday } from '../projects-domain';
import {
  backlogOf,
  burndown,
  manages,
  points,
  recordBurndown,
  recordSprintDay,
  toSprint,
  toTask,
  velocity,
} from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

/** The sprint named in the path, if the caller can see its project (404 otherwise). */
function visibleSprint(
  r: Reply,
  membership: MembershipRecord,
  sprintId: unknown,
): { sprint: SprintRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'sprintId', sprintId);
  if (badId) return badId;
  const sprint = db.state.sprints.find((s) => s.id === sprintId);
  const project = sprint && db.state.projects.find((p) => p.id === sprint.projectId);
  return sprint && project && canSee(project, membership)
    ? { sprint, project }
    : r.problem(404, 'resource.not_found');
}

function sprintShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0)
    v.add('body', 'required', 'send at least one field');
  if (creating || body['name'] !== undefined) v.string('name', body['name'], 1, 100);
  if (body['goal'] !== undefined) v.string('goal', body['goal'], 0, 500, false);
  v.date('startDate', body['startDate'], creating);
  v.date('endDate', body['endDate'], creating);
}

function checkDates(v: Validator, start: string, end: string): void {
  if (end < start) v.add('endDate', 'invalid', 'must not be before the start date');
}

export const sprintHandlers = [
  http.get(`${API}/projects/:projectId/backlog`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const v = new Validator();
    const page = paging(new URL(request.url), ['rank'], 'rank,asc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(sortAndPage(backlogOf(project.id).map(toTask), page, { rank: (t) => t.rank }));
  }),

  http.get(`${API}/projects/:projectId/sprints`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(
      db.state.sprints
        .filter((s) => s.projectId === project.id)
        .sort(
          (a, b) =>
            b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
        )
        .map(toSprint),
    );
  }),

  http.post(`${API}/projects/:projectId/sprints`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    sprintShape(v, body, true);
    if (v.ok) checkDates(v, String(body['startDate']), String(body['endDate']));
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (project.methodology === 'PREDICTIVE') return r.problem(409, 'sprints.not_agile');

    const record: SprintRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: String(body['name']).trim(),
      ...(body['goal'] ? { goal: String(body['goal']).trim() } : {}),
      startDate: String(body['startDate']),
      endDate: String(body['endDate']),
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      version: 1,
    };
    db.state.sprints.push(record);
    db.save();
    return r.json(toSprint(record), 201, {
      ...etag(record.version),
      Location: `/api/v1/sprints/${record.id}`,
    });
  }),

  http.get(`${API}/sprints/:sprintId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    return r.json(toSprint(found.sprint), 200, etag(found.sprint.version));
  }),

  http.patch(`${API}/sprints/:sprintId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'sprintId', params['sprintId']);
    if (badId) return badId;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    sprintShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    const { sprint, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const stale = checkVersion(r, sent, sprint.version);
    if (stale) return stale;
    const domain = new Validator();
    checkDates(
      domain,
      (body['startDate'] as string | undefined) ?? sprint.startDate,
      (body['endDate'] as string | undefined) ?? sprint.endDate,
    );
    if (!domain.ok) return domain.problem(r);
    if (sprint.status === 'CLOSED') return r.problem(409, 'sprints.closed');

    if (body['name'] !== undefined) sprint.name = String(body['name']).trim();
    if (body['goal'] !== undefined) sprint.goal = String(body['goal']).trim();
    if (body['startDate'] !== undefined) sprint.startDate = String(body['startDate']);
    if (body['endDate'] !== undefined) sprint.endDate = String(body['endDate']);
    sprint.version += 1;
    db.save();
    return r.json(toSprint(sprint), 200, etag(sprint.version));
  }),

  http.post(`${API}/sprints/:sprintId/start`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    const { sprint, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const running = db.state.sprints.some(
      (s) => s.projectId === project.id && s.status === 'ACTIVE',
    );
    if (sprint.status === 'PLANNED' && running) return r.problem(409, 'sprints.already_active');
    if (sprint.status !== 'PLANNED') return r.problem(409, 'sprints.not_planned');

    // The commitment is frozen now.
    sprint.committedPoints = db.state.tasks
      .filter((t) => t.sprintId === sprint.id)
      .reduce((total, t) => total + points(t), 0);
    sprint.status = 'ACTIVE';
    sprint.version += 1;
    recordSprintDay(sprint, project.id);
    db.save();
    return r.json(toSprint(sprint), 200, etag(sprint.version));
  }),

  http.post(`${API}/sprints/:sprintId/close`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'sprintId', params['sprintId']);
    if (badId) return badId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('carryOverTo', body['carryOverTo'], 1, 36);
    if (!v.ok) return v.problem(r);
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    const { sprint, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const carryOverTo = String(body['carryOverTo']);
    const next =
      carryOverTo === CARRY_OVER_TO_BACKLOG
        ? undefined
        : db.state.sprints.find(
            (s) => s.id === carryOverTo && s.projectId === project.id && s.status === 'PLANNED',
          );
    if (carryOverTo !== CARRY_OVER_TO_BACKLOG && !next) {
      const domain = new Validator();
      domain.add('carryOverTo', 'invalid', 'must be BACKLOG or a planned sprint of this project');
      return domain.problem(r);
    }
    if (sprint.status !== 'ACTIVE') return r.problem(409, 'sprints.not_active');

    const inSprint = db.state.tasks.filter((t) => t.sprintId === sprint.id);
    sprint.completedPoints = inSprint
      .filter((t) => t.status === 'DONE')
      .reduce((total, t) => total + points(t), 0);
    recordSprintDay(sprint, project.id);
    sprint.status = 'CLOSED';
    sprint.version += 1;
    for (const task of inSprint) {
      if (task.status === 'DONE') continue;
      if (next) task.sprintId = next.id;
      else delete task.sprintId;
    }
    db.save();
    return r.json(toSprint(sprint), 200, etag(sprint.version));
  }),

  http.post(`${API}/sprints/:sprintId/tasks`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'sprintId', params['sprintId']);
    if (badId) return badId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const taskIds = body['taskIds'];
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      v.add('taskIds', 'required', 'at least one task');
    } else if (taskIds.length > 200) {
      v.add('taskIds', 'length', 'at most 200 tasks', { max: 200 });
    } else taskIds.forEach((taskId: unknown, i) => v.uuid(`taskIds[${i}]`, taskId, true));
    if (!v.ok) return v.problem(r);
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    const { sprint, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (sprint.status === 'CLOSED') return r.problem(409, 'sprints.closed');
    const wanted = new Set(taskIds as string[]);
    const tasks = db.state.tasks.filter((t) => wanted.has(t.id) && t.projectId === project.id);
    if (tasks.length !== wanted.size) {
      const domain = new Validator();
      domain.add('taskIds', 'invalid', "every task must belong to this sprint's project");
      return domain.problem(r);
    }
    tasks.forEach((t) => (t.sprintId = sprint.id));
    recordBurndown(project.id);
    db.save();
    return r.json(toSprint(sprint));
  }),

  http.delete(`${API}/sprints/:sprintId/tasks/:taskId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badTask = checkPathId(r, 'taskId', params['taskId']);
    if (badTask) return badTask;
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    const { sprint, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (sprint.status === 'CLOSED') return r.problem(409, 'sprints.closed');
    const task = db.state.tasks.find((t) => t.id === params['taskId'] && t.sprintId === sprint.id);
    if (!task) return r.problem(404, 'resource.not_found');
    delete task.sprintId;
    recordBurndown(project.id);
    db.save();
    return r.empty(204);
  }),

  http.get(`${API}/sprints/:sprintId/burndown`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleSprint(r, membership, params['sprintId']);
    if (found instanceof Response) return found;
    return r.json(burndown(found.sprint, orgToday(found.project.organizationId)));
  }),

  http.get(`${API}/projects/:projectId/velocity`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const lastParam = new URL(request.url).searchParams.get('last');
    const last = lastParam === null ? 6 : Number(lastParam);
    const v = new Validator();
    if (!Number.isInteger(last)) v.add('last', 'invalid', 'must be a whole number');
    else v.number('last', last, 1, 20);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(velocity(project.id, last));
  }),
];
