import { http } from 'msw';
import {
  BOARD_STATUSES,
  BoardStatus,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { ProjectRecord } from '../data-projects';
import { TaskRecord } from '../data-work';
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
import { canSee } from '../projects-domain';
import {
  PRIORITY_ORDER,
  board,
  canBeAssigned,
  canChangeTask,
  canMoveTask,
  manages,
  participates,
  rankBetween,
  recordBurndown,
  tasksOf,
  toTask,
} from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

const TASK_SORT_FIELDS = ['rank', 'key', 'priority', 'dueDate', 'createdAt'] as const;
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,29}$/u;

/** The task named in the path, if the caller can see its project (404 otherwise). */
export function visibleTask(
  r: Reply,
  membership: MembershipRecord,
  taskId: unknown,
): { task: TaskRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'taskId', taskId);
  if (badId) return badId;
  const task = db.state.tasks.find((t) => t.id === taskId);
  const project = task && db.state.projects.find((p) => p.id === task.projectId);
  return task && project && canSee(project, membership)
    ? { task, project }
    : r.problem(404, 'resource.not_found');
}

function integer(v: Validator, field: string, value: unknown, max: number): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    v.add(field, 'invalid', 'must be a whole number');
  } else v.number(field, value, 0, max);
}

function taskShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0)
    v.add('body', 'required', 'send at least one field');
  if (creating || body['title'] !== undefined) v.string('title', body['title'], 1, 200);
  if (body['description'] !== undefined)
    v.string('description', body['description'], 0, 10_000, false);
  if (creating || body['type'] !== undefined) v.oneOf('type', body['type'], TASK_TYPES);
  if (body['priority'] !== undefined) v.oneOf('priority', body['priority'], TASK_PRIORITIES);
  if (creating && body['status'] !== undefined) {
    v.oneOf('status', body['status'], ['BACKLOG', 'TODO'] as const);
  }
  v.uuid('assigneeId', body['assigneeId']);
  v.uuid('wbsNodeId', body['wbsNodeId']);
  if (creating) v.uuid('sprintId', body['sprintId']);
  integer(v, 'storyPoints', body['storyPoints'], 100);
  v.number('estimateHours', body['estimateHours'], 0, 10_000);
  v.number('remainingHours', body['remainingHours'], 0, 10_000);
  v.date('startDate', body['startDate']);
  v.date('dueDate', body['dueDate']);
  const labels = body['labels'];
  if (labels !== undefined && labels !== null) {
    if (!Array.isArray(labels)) v.add('labels', 'invalid', 'must be a list');
    else if (labels.length > 10) v.add('labels', 'length', 'at most 10 labels', { max: 10 });
    else {
      labels.forEach((label: unknown, i) => {
        if (typeof label !== 'string' || !LABEL.test(label.trim())) {
          v.add(`labels[${i}]`, 'format', 'letters, digits, spaces, _ and -; at most 30');
        }
      });
    }
  }
}

/** Assignee, work package, sprint and dates must make sense for this project (400 otherwise). */
function taskDomain(
  v: Validator,
  body: Record<string, unknown>,
  project: ProjectRecord,
  current?: TaskRecord,
): void {
  const assigneeId = body['assigneeId'];
  if (typeof assigneeId === 'string' && !canBeAssigned(project, assigneeId)) {
    v.add('assigneeId', 'invalid', 'must be the project manager or a contributor on the team');
  }
  const wbsNodeId = body['wbsNodeId'];
  if (
    typeof wbsNodeId === 'string' &&
    !db.state.wbsNodes.some(
      (n) => n.id === wbsNodeId && n.projectId === project.id && n.type === 'WORK_PACKAGE',
    )
  ) {
    v.add('wbsNodeId', 'invalid', 'must be a work package of this project');
  }
  const sprintId = body['sprintId'];
  if (
    typeof sprintId === 'string' &&
    !db.state.sprints.some(
      (s) => s.id === sprintId && s.projectId === project.id && s.status !== 'CLOSED',
    )
  ) {
    v.add('sprintId', 'invalid', 'must be an open sprint of this project');
  }
  const start = (body['startDate'] as string | undefined) ?? current?.startDate;
  const due = (body['dueDate'] as string | undefined) ?? current?.dueDate;
  if (start && due && due < start) v.add('dueDate', 'invalid', 'must not be before the start date');
}

function cleanLabels(labels: unknown): string[] {
  const list = (labels as string[] | undefined) ?? [];
  return [...new Set(list.map((l) => l.trim()))].slice(0, 10);
}

function apply(task: TaskRecord, body: Record<string, unknown>): void {
  if (body['title'] !== undefined) task.title = String(body['title']).trim();
  if (body['description'] !== undefined) task.description = String(body['description']);
  if (body['type'] !== undefined) task.type = body['type'] as TaskType;
  if (body['priority'] !== undefined) task.priority = body['priority'] as TaskPriority;
  if (body['assigneeId'] !== undefined) task.assigneeId = String(body['assigneeId']);
  if (body['wbsNodeId'] !== undefined) task.wbsNodeId = String(body['wbsNodeId']);
  for (const key of ['storyPoints', 'estimateHours', 'remainingHours'] as const) {
    if (body[key] !== undefined) task[key] = Number(body[key]);
  }
  if (body['startDate'] !== undefined) task.startDate = String(body['startDate']);
  if (body['dueDate'] !== undefined) task.dueDate = String(body['dueDate']);
  if (body['labels'] !== undefined) task.labels = cleanLabels(body['labels']);
}

export const taskHandlers = [
  http.get(`${API}/projects/:projectId/tasks`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const get = (name: string) => url.searchParams.get(name);
    const v = new Validator();
    if (get('status') !== null) v.oneOf('status', get('status'), TASK_STATUSES);
    if (get('type') !== null) v.oneOf('type', get('type'), TASK_TYPES);
    v.uuid('assigneeId', get('assigneeId') ?? undefined);
    v.uuid('sprintId', get('sprintId') ?? undefined);
    const q = get('q')?.trim().toLowerCase() ?? '';
    const page = paging(url, TASK_SORT_FIELDS, 'rank,asc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;

    const tasks = tasksOf(project.id)
      .filter((t) => !get('status') || t.status === get('status'))
      .filter((t) => !get('type') || t.type === get('type'))
      .filter((t) => !get('assigneeId') || t.assigneeId === get('assigneeId'))
      .filter((t) => !get('sprintId') || t.sprintId === get('sprintId'))
      .filter((t) => !get('label') || t.labels.includes(get('label') ?? ''))
      .map(toTask)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q));
    return r.json(
      sortAndPage(tasks, page, {
        rank: (t) => t.rank,
        key: (t) => Number(t.key.split('-').pop()),
        priority: (t) => PRIORITY_ORDER[t.priority],
        dueDate: (t) => t.dueDate ?? '9999-12-31',
        createdAt: (t) => t.createdAt,
      }),
    );
  }),

  http.post(`${API}/projects/:projectId/tasks`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    taskShape(v, body, true);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!participates(project, membership)) return r.problem(403, 'access.denied');
    const domain = new Validator();
    taskDomain(domain, body, project);
    if (!domain.ok) return domain.problem(r);
    if (db.state.portfolios.find((p) => p.id === project.portfolioId)?.status === 'ARCHIVED') {
      return r.problem(409, 'portfolios.archived');
    }

    const existing = tasksOf(project.id);
    const record: TaskRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number: Math.max(0, ...existing.map((t) => t.number)) + 1,
      title: '',
      type: body['type'] as TaskType,
      priority: 'MEDIUM',
      status: (body['status'] as TaskStatus | undefined) ?? 'BACKLOG',
      labels: [],
      rank: rankBetween(project.id, existing.at(-1), undefined),
      createdAt: new Date().toISOString(),
      version: 1,
      ...(body['sprintId'] ? { sprintId: String(body['sprintId']) } : {}),
    };
    apply(record, body);
    db.state.tasks.push(record);
    recordBurndown(project.id);
    db.save();
    return r.json(toTask(record), 201, {
      ...etag(record.version),
      Location: `/api/v1/tasks/${record.id}`,
    });
  }),

  http.get(`${API}/tasks/:taskId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleTask(r, membership, params['taskId']);
    if (found instanceof Response) return found;
    return r.json(toTask(found.task), 200, etag(found.task.version));
  }),

  http.patch(`${API}/tasks/:taskId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'taskId', params['taskId']);
    if (badId) return badId;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    taskShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const found = visibleTask(r, membership, params['taskId']);
    if (found instanceof Response) return found;
    const { task, project } = found;
    if (!canChangeTask(task, project, membership)) return r.problem(403, 'access.denied');
    const stale = checkVersion(r, sent, task.version);
    if (stale) return stale;
    const domain = new Validator();
    taskDomain(domain, body, project, task);
    if (!domain.ok) return domain.problem(r);

    apply(task, body);
    task.version += 1;
    recordBurndown(project.id);
    db.save();
    return r.json(toTask(task), 200, etag(task.version));
  }),

  http.delete(`${API}/tasks/:taskId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleTask(r, membership, params['taskId']);
    if (found instanceof Response) return found;
    if (!manages(found.project, membership)) return r.problem(403, 'access.denied');
    db.state.tasks = db.state.tasks.filter((t) => t !== found.task);
    db.state.taskComments = db.state.taskComments.filter((c) => c.taskId !== found.task.id);
    recordBurndown(found.project.id);
    db.save();
    return r.empty(204);
  }),

  http.post(`${API}/tasks/:taskId/move`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'taskId', params['taskId']);
    if (badId) return badId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.oneOf('status', body['status'], TASK_STATUSES);
    v.uuid('afterTaskId', body['afterTaskId']);
    v.uuid('beforeTaskId', body['beforeTaskId']);
    if (body['override'] !== undefined && typeof body['override'] !== 'boolean') {
      v.add('override', 'invalid', 'must be true or false');
    }
    if (body['reason'] !== undefined) v.string('reason', body['reason'], 0, 500, false);
    if (!v.ok) return v.problem(r);
    const found = visibleTask(r, membership, params['taskId']);
    if (found instanceof Response) return found;
    const { task, project } = found;
    if (!canChangeTask(task, project, membership)) return r.problem(403, 'access.denied');

    const target = body['status'] as TaskStatus;
    const neighbour = (field: 'afterTaskId' | 'beforeTaskId') => {
      const neighbourId = body[field];
      if (typeof neighbourId !== 'string') return { ok: true as const, task: undefined };
      const other = db.state.tasks.find(
        (t) => t.id === neighbourId && t.projectId === project.id && t.id !== task.id,
      );
      return other ? { ok: true as const, task: other } : { ok: false as const, task: undefined };
    };
    const above = neighbour('afterTaskId');
    const below = neighbour('beforeTaskId');
    const domain = new Validator();
    if (!above.ok) domain.add('afterTaskId', 'invalid', 'must be another task of this project');
    if (!below.ok) domain.add('beforeTaskId', 'invalid', 'must be another task of this project');
    if (above.task && below.task && above.task.rank >= below.task.rank) {
      domain.add('afterTaskId', 'invalid', 'must come before beforeTaskId');
    }
    if (!domain.ok) return domain.problem(r);

    // WIP limit (project-wide count), checked before the transition itself, as the API does.
    if (target !== task.status && target !== 'BACKLOG') {
      const column = db.state.boardColumns.find(
        (c) => c.projectId === project.id && c.status === target,
      );
      const inColumn = db.state.tasks.filter(
        (t) => t.projectId === project.id && t.status === target,
      ).length;
      if (
        column?.wipLimit !== undefined &&
        inColumn >= column.wipLimit &&
        body['override'] !== true
      ) {
        return r.problem(409, 'tasks.wip_limit_reached', {
          detail: `'${column.name}' is at its WIP limit of ${column.wipLimit}`,
        });
      }
    }
    if (target !== task.status) {
      if (!canMoveTask(task.status, target)) return r.problem(409, 'tasks.invalid_transition');
      if (task.status === 'DONE' && !manages(project, membership)) {
        return r.problem(403, 'access.denied');
      }
      const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
      if (target === 'BLOCKED' && !reason) {
        const missing = new Validator();
        missing.add('reason', 'required', 'say what blocks the task');
        return missing.problem(r);
      }
      if (target === 'DONE' && (task.remainingHours ?? 0) > 0) {
        return r.problem(409, 'tasks.remaining_work');
      }
      task.status = target;
      if (target === 'BLOCKED') task.blockedReason = reason;
      else delete task.blockedReason;
      if (target === 'DONE') task.completedAt = new Date().toISOString();
      else delete task.completedAt;
    }
    const others = tasksOf(project.id).filter((t) => t.id !== task.id);
    if (above.task || below.task) {
      const lower = above.task ?? others.filter((t) => t.rank < (below.task?.rank ?? '')).at(-1);
      const upper = below.task ?? others.find((t) => t.rank > (above.task?.rank ?? ''));
      task.rank = rankBetween(project.id, lower, upper);
    } else {
      task.rank = rankBetween(project.id, others.at(-1), undefined);
    }
    task.version += 1;
    recordBurndown(project.id);
    db.save();
    return r.json(toTask(task), 200, etag(task.version));
  }),

  http.get(`${API}/tasks/:taskId/comments`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleTask(r, membership, params['taskId']);
    if (found instanceof Response) return found;
    return r.json(
      db.state.taskComments
        .filter((c) => c.taskId === found.task.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((c) => ({
          id: c.id,
          author: { userId: c.authorId, fullName: db.user(c.authorId)?.fullName ?? '' },
          body: c.body,
          createdAt: c.createdAt,
        })),
    );
  }),

  http.post(`${API}/tasks/:taskId/comments`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'taskId', params['taskId']);
    if (badId) return badId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('body', body['body'], 1, 5000);
    if (!v.ok) return v.problem(r);
    const found = visibleTask(r, membership, params['taskId']);
    if (found instanceof Response) return found;
    if (!participates(found.project, membership)) return r.problem(403, 'access.denied');
    const comment = {
      id: crypto.randomUUID(),
      taskId: found.task.id,
      authorId: membership.userId,
      body: String(body['body']).trim(),
      createdAt: new Date().toISOString(),
    };
    db.state.taskComments.push(comment);
    db.save();
    return r.json(
      {
        id: comment.id,
        author: { userId: comment.authorId, fullName: db.user(comment.authorId)?.fullName ?? '' },
        body: comment.body,
        createdAt: comment.createdAt,
      },
      201,
    );
  }),

  http.get(`${API}/projects/:projectId/board`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sprintId = new URL(request.url).searchParams.get('sprintId') ?? undefined;
    const v = new Validator();
    v.uuid('sprintId', sprintId);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(board(project, sprintId));
  }),

  http.put(`${API}/projects/:projectId/board/columns/:status`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const status = params['status'];
    const v = new Validator();
    v.oneOf('status', status, BOARD_STATUSES);
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    v.string('name', body['name'], 1, 40);
    if (body['wipLimit'] !== undefined && body['wipLimit'] !== null) {
      if (typeof body['wipLimit'] !== 'number' || !Number.isInteger(body['wipLimit'])) {
        v.add('wipLimit', 'invalid', 'must be a whole number');
      } else v.number('wipLimit', body['wipLimit'], 1, 100);
    }
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');

    const settings = {
      projectId: project.id,
      status: status as BoardStatus,
      name: String(body['name']).trim(),
      ...(typeof body['wipLimit'] === 'number' ? { wipLimit: body['wipLimit'] } : {}),
    };
    db.state.boardColumns = [
      ...db.state.boardColumns.filter((c) => !(c.projectId === project.id && c.status === status)),
      settings,
    ];
    db.save();
    return r.json({
      status: settings.status,
      name: settings.name,
      ...(settings.wipLimit !== undefined ? { wipLimit: settings.wipLimit } : {}),
    });
  }),
];
