import {
  ActivityEntry,
  AppNotification,
  AuditEvent,
  FieldChange,
  NotificationType,
} from '../core/api/api.models';
import { isoWeekOf } from '../shared/format/iso-week';
import { chainHash } from './audit-chain';
import { broker } from './broker';
import { ACTIVITY_TYPES, AuditRecord, DEMO_IP, NotificationRecord } from './data-activity';
import { ChangeRequestRecord } from './data-governance';
import { TaskRecord } from './data-work';
import { TimesheetRecord } from './data-time';
import { db } from './db';
import { awaits, changeRequestKey, issueKey, riskKey } from './governance-domain';
import { userIdFromBearer } from './http';
import { userRef } from './projects-domain';

/**
 * The mock's transactional outbox (feature 18): after each successful change it writes the audit
 * row (hash-chained), the project's activity entry and the notifications the API would send, and
 * pushes them to the live broker. Handlers stay unaware; `before()` snapshots the item a request
 * targets, `after()` compares it with the result.
 */

type Verb = 'created' | 'updated' | 'deleted';
/** Where the item's id comes from: a path group, the response body, the project or the org. */
type IdSource = number | 'body' | 'project' | 'org';

interface Rule {
  readonly methods: readonly string[];
  readonly path: RegExp;
  readonly type: string;
  readonly verb: Verb | null;
  readonly id: IdSource;
}

const UUID = '([0-9a-f-]{36})';

function rule(methods: string, path: string, type: string, verb: Verb | null, id: IdSource): Rule {
  return {
    methods: methods.split('|'),
    path: new RegExp(`^${path.replaceAll('(I)', UUID).replaceAll('(P)', UUID)}$`),
    type,
    verb,
    id,
  };
}

/** Mutating operations and the item they change (`verb` null: from the method). */
const RULES: readonly Rule[] = [
  rule('POST', '/projects', 'project', 'created', 'body'),
  rule('PATCH', '/projects/(P)', 'project', 'updated', 1),
  rule('POST', '/projects/(P)/transitions', 'project', 'updated', 1),
  rule('PUT|DELETE', '/projects/(P)/health-override', 'project', 'updated', 1),
  rule('PUT', '/projects/(P)/members/(I)', 'project-member', null, 2),
  rule('DELETE', '/projects/(P)/members/(I)', 'project-member', 'deleted', 2),
  rule('PUT', '/projects/(P)/charter', 'charter', 'updated', 'project'),
  rule('POST', '/projects/(P)/charter/(?:submit|approve|return)', 'charter', 'updated', 'project'),
  rule('POST', '/projects/(P)/wbs/nodes', 'wbs-node', 'created', 'body'),
  rule('PATCH|DELETE', '/wbs/nodes/(I)', 'wbs-node', null, 1),
  rule('POST', '/wbs/nodes/(I)/move', 'wbs-node', 'updated', 1),
  rule('POST', '/projects/(P)/tasks', 'task', 'created', 'body'),
  rule('PATCH|DELETE', '/tasks/(I)', 'task', null, 1),
  rule('POST', '/tasks/(I)/move', 'task', 'updated', 1),
  rule('POST', '/tasks/(I)/comments', 'task-comment', 'created', 'body'),
  rule('POST', '/projects/(P)/sprints', 'sprint', 'created', 'body'),
  rule('PATCH', '/sprints/(I)', 'sprint', 'updated', 1),
  rule('POST', '/sprints/(I)/(?:start|close|tasks)', 'sprint', 'updated', 1),
  rule('DELETE', '/sprints/(I)/tasks/(I)', 'task', 'updated', 2),
  rule('PUT', '/projects/(P)/board/columns/[A-Z_]+', 'board-column', 'updated', 'project'),
  rule('POST', '/projects/(P)/dependencies', 'dependency', 'created', 'body'),
  rule('DELETE', '/dependencies/(I)', 'dependency', 'deleted', 1),
  rule('POST', '/projects/(P)/schedule/baseline', 'baseline', 'created', 'project'),
  rule('POST', '/projects/(P)/risks', 'risk', 'created', 'body'),
  rule('PATCH', '/risks/(I)', 'risk', 'updated', 1),
  rule('POST', '/risks/(I)/(?:close|materialize)', 'risk', 'updated', 1),
  rule('POST', '/risks/(I)/assessments', 'risk-assessment', 'created', 'body'),
  rule('POST', '/projects/(P)/issues', 'issue', 'created', 'body'),
  rule('PATCH', '/issues/(I)', 'issue', 'updated', 1),
  rule('POST', '/issues/(I)/(?:close|reopen|resolve)', 'issue', 'updated', 1),
  rule('POST', '/projects/(P)/stakeholders', 'stakeholder', 'created', 'body'),
  rule('PATCH|DELETE', '/stakeholders/(I)', 'stakeholder', null, 1),
  rule('POST', '/projects/(P)/change-requests', 'change-request', 'created', 'body'),
  rule('PATCH', '/change-requests/(I)', 'change-request', 'updated', 1),
  rule(
    'POST',
    '/change-requests/(I)/(?:decisions|implement|revise|submit|withdraw)',
    'change-request',
    'updated',
    1,
  ),
  rule('POST', '/timesheets/(I)/(?:approve|reject)', 'timesheet', 'updated', 1),
  rule('PUT', '/projects/(P)/allocations', 'allocation', 'updated', 'project'),
  rule('PUT', '/projects/(P)/evm/settings', 'evm-settings', 'updated', 'project'),
  rule('POST', '/attachments/(I)/complete', 'attachment', 'created', 1),
  rule('DELETE', '/attachments/(I)', 'attachment', 'deleted', 1),
  rule('POST', '/reports', 'report-job', 'created', 'body'),
  rule('PATCH', '/organization', 'organization', 'updated', 'org'),
  rule('PUT', '/organization/calendar', 'working-calendar', 'updated', 'org'),
  rule('POST', '/organization/calendar/public-holidays', 'working-calendar', 'updated', 'org'),
  rule('PUT', '/organization/change-control', 'change-control-settings', 'updated', 'org'),
  rule('POST', '/invitations', 'invitation', 'created', 'body'),
  rule('DELETE', '/invitations/(I)', 'invitation', 'deleted', 1),
  rule('PATCH|DELETE', '/members/(I)', 'membership', null, 1),
  rule('POST', '/portfolios', 'portfolio', 'created', 'body'),
  rule('PATCH|DELETE', '/portfolios/(I)', 'portfolio', null, 1),
  rule('POST', '/portfolios/(I)/programs', 'program', 'created', 'body'),
  rule('PATCH', '/programs/(I)', 'program', 'updated', 1),
  rule('POST', '/users/(I)/cost-rates', 'cost-rate', 'created', 'body'),
  rule('POST', '/users/(I)/leave', 'leave', 'created', 'body'),
  rule('DELETE', '/leave/(I)', 'leave', 'deleted', 1),
  rule('PUT', '/users/(I)/capacity', 'capacity-period', 'updated', 1),
];

type Row = Record<string, unknown>;

const projectCode = (projectId: string) =>
  db.state.projects.find((p) => p.id === projectId)?.code ?? '?';
const nameOf = (userId: string) => db.user(userId)?.fullName;

/** How to find an item's current state, its label and its project. */
const ITEMS: Record<
  string,
  {
    find(id: string): Row | undefined;
    label?(row: Row): string | undefined;
    project?(row: Row): string | undefined;
  }
> = {
  project: {
    find: (id) => db.state.projects.find((p) => p.id === id) as Row | undefined,
    label: (row) => row['code'] as string,
    project: (row) => row['id'] as string,
  },
  task: {
    find: (id) => db.state.tasks.find((t) => t.id === id) as Row | undefined,
    label: (row) => `${projectCode(row['projectId'] as string)}-${row['number'] as number}`,
  },
  risk: {
    find: (id) => db.state.risks.find((r) => r.id === id) as Row | undefined,
    label: (row) => riskKey(row as never),
  },
  issue: {
    find: (id) => db.state.issues.find((i) => i.id === id) as Row | undefined,
    label: (row) => issueKey(row as never),
  },
  'change-request': {
    find: (id) => db.state.changeRequests.find((c) => c.id === id) as Row | undefined,
    label: (row) => changeRequestKey(row as never),
  },
  stakeholder: {
    find: (id) => db.state.stakeholders.find((s) => s.id === id) as Row | undefined,
    label: (row) => row['name'] as string,
  },
  sprint: {
    find: (id) => db.state.sprints.find((s) => s.id === id) as Row | undefined,
    label: (row) => row['name'] as string,
  },
  'wbs-node': {
    find: (id) => db.state.wbsNodes.find((n) => n.id === id) as Row | undefined,
    label: (row) => row['name'] as string,
  },
  charter: {
    find: (projectId) =>
      db.state.charters.find((c) => c.projectId === projectId) as Row | undefined,
    label: (row) => projectCode(row['projectId'] as string),
  },
  timesheet: {
    find: (id) => db.state.timesheets.find((t) => t.id === id) as Row | undefined,
    label: (row) =>
      `${nameOf(row['userId'] as string) ?? ''} · ${isoWeekOf(row['weekStart'] as string)}`,
  },
  'project-member': {
    find: (userId) => db.state.projectMembers.find((m) => m.userId === userId) as Row | undefined,
    label: (row) => nameOf(row['userId'] as string),
  },
  attachment: {
    find: (id) => db.state.attachments.find((a) => a.id === id) as Row | undefined,
    label: (row) => row['fileName'] as string,
  },
  'report-job': {
    find: (id) => db.state.reportJobs.find((j) => j.id === id) as Row | undefined,
    project: (row) => (row['params'] as { projectId?: string }).projectId,
  },
  membership: {
    find: (id) => db.state.memberships.find((m) => m.id === id) as Row | undefined,
    label: (row) => nameOf(row['userId'] as string),
  },
  invitation: {
    find: (id) => db.state.invitations.find((i) => i.id === id) as Row | undefined,
    label: (row) => row['email'] as string,
  },
  portfolio: {
    find: (id) => db.state.portfolios.find((p) => p.id === id) as Row | undefined,
    label: (row) => row['name'] as string,
  },
  program: {
    find: (id) => db.state.programs.find((p) => p.id === id) as Row | undefined,
    label: (row) => row['name'] as string,
  },
  dependency: {
    find: (id) => db.state.dependencies.find((d) => d.id === id) as Row | undefined,
  },
  organization: {
    find: (id) => db.state.organizations.find((o) => o.id === id) as unknown as Row | undefined,
    label: (row) => row['name'] as string,
    project: () => undefined,
  },
};

/** Fields never in a diff: identity, bookkeeping and internal ordering. */
const SKIPPED = new Set([
  'id',
  'version',
  'rank',
  'number',
  'organizationId',
  'projectId',
  'createdAt',
  'updatedAt',
  'completedAt',
  'storageKey',
  'hash',
]);
const SECRET = /password|token|secret|hash$/i;

/** A field value as the API records it: scalars as they are, money as the API prints it. */
function recorded(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const money = value as { amount?: unknown; currency?: unknown };
  if (typeof money.amount === 'string' && typeof money.currency === 'string') {
    return `Money[amount=${money.amount}, currency=${money.currency}]`;
  }
  return undefined;
}

/** Changed fields only; collections never appear, secrets appear without values. */
export function diff(before?: Row, after?: Row): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (SKIPPED.has(key)) continue;
    const from = before ? recorded(before[key]) : undefined;
    const to = after ? recorded(after[key]) : undefined;
    if (Array.isArray(before?.[key]) || Array.isArray(after?.[key])) continue;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    if (from === undefined && to === undefined) continue;
    changes[key] = SECRET.test(key)
      ? {}
      : {
          ...(from !== undefined ? { before: from } : {}),
          ...(to !== undefined ? { after: to } : {}),
        };
  }
  return changes;
}

// ---------- Converters (records → API shapes) ----------

export function toNotification(record: NotificationRecord): AppNotification {
  return {
    id: record.id,
    type: record.type,
    titleKey: record.titleKey,
    params: record.params,
    ...(record.link ? { link: record.link } : {}),
    ...(record.readAt ? { readAt: record.readAt } : {}),
    createdAt: record.createdAt,
  };
}

export function toAuditEvent(record: AuditRecord): AuditEvent {
  const { actorId, ...rest } = record;
  const event: Partial<AuditRecord> = { ...rest };
  delete event.organizationId;
  delete event.hash;
  return {
    ...(event as Omit<AuditRecord, 'organizationId' | 'hash' | 'actorId'>),
    ...(actorId ? { actor: userRef(actorId) } : {}),
  };
}

export function toActivityEntry(record: {
  id: string;
  occurredAt: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  changedFields: string[];
}): ActivityEntry {
  return {
    id: record.id,
    occurredAt: record.occurredAt,
    ...(record.actorId ? { actor: userRef(record.actorId) } : {}),
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    ...(record.entityLabel ? { entityLabel: record.entityLabel } : {}),
    changedFields: record.changedFields,
  };
}

// ---------- Recording ----------

/** Appends an audit row to its organization's chain. */
export function audit(row: Omit<AuditRecord, 'id' | 'hash'>): AuditRecord {
  const previous = db.state.audit.filter((a) => a.organizationId === row.organizationId).at(-1);
  const content = { id: crypto.randomUUID(), ...row };
  const record: AuditRecord = { ...content, hash: chainHash(previous?.hash ?? '', content) };
  db.state.audit.push(record);
  return record;
}

/** Creates a notification unless the person turned that kind off, and pushes it live. */
export function notify(
  userId: string,
  organizationId: string,
  type: NotificationType,
  params: Record<string, unknown>,
  link?: string,
): void {
  const preference = db.state.notificationPreferences.find(
    (p) => p.userId === userId && p.type === type,
  );
  if (preference && !preference.inApp) return;
  const record: NotificationRecord = {
    id: crypto.randomUUID(),
    organizationId,
    userId,
    type,
    titleKey: `notifications.${type.toLowerCase()}`,
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
    ...(link ? { link } : {}),
    createdAt: new Date().toISOString(),
  };
  db.state.notifications.push(record);
  broker.toUser(userId, organizationId, toNotification(record));
}

interface Pending {
  readonly rule: Rule;
  readonly match: RegExpExecArray;
  readonly before?: Row;
}

const pending = new Map<string, Pending>();
const PATH = /\/api\/v1(\/[^?]*)/;

function matchRule(method: string, url: string): { rule: Rule; match: RegExpExecArray } | null {
  const path = PATH.exec(new URL(url).pathname)?.[1];
  if (!path || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  for (const candidate of RULES) {
    if (!candidate.methods.includes(method)) continue;
    const match = candidate.path.exec(path);
    if (match) return { rule: candidate, match };
  }
  return null;
}

function pathId(rule: Rule, match: RegExpExecArray): string | undefined {
  return typeof rule.id === 'number'
    ? match[rule.id]
    : rule.id === 'project'
      ? match[1]
      : undefined;
}

/** Before the handlers run: remember what the request is about to change. */
export function before(key: string, request: Request): void {
  const found = matchRule(request.method, request.url);
  if (!found) return;
  const id = pathId(found.rule, found.match);
  const snapshot = id ? ITEMS[found.rule.type]?.find(id) : undefined;
  pending.set(key, { ...found, ...(snapshot ? { before: structuredClone(snapshot) } : {}) });
}

/** After the response: record the change, or the refusal. */
export async function after(key: string, request: Request, response: Response): Promise<void> {
  const context = pending.get(key);
  pending.delete(key);
  const actorId = userIdFromBearer(request.headers.get('Authorization') ?? '') ?? undefined;
  const organizationId = request.headers.get('X-Organization-Id') ?? '';
  const correlationId = response.headers.get('X-Correlation-Id') ?? undefined;
  const userAgent = request.headers.get('User-Agent') ?? undefined;
  const common = {
    organizationId,
    occurredAt: new Date().toISOString(),
    ...(actorId ? { actorId } : {}),
    actorIp: DEMO_IP,
    ...(userAgent ? { userAgent } : {}),
    ...(correlationId ? { correlationId } : {}),
  };

  if (response.status === 403 && actorId && db.membership(actorId, organizationId)) {
    const path = new URL(request.url).pathname;
    audit({
      ...common,
      action: 'access.denied',
      entityType: 'request',
      entityLabel: `${request.method} ${path}`,
      outcome: 'DENIED',
      changes: {},
    });
    db.save();
    return;
  }
  if (!context || !response.ok || !actorId || !organizationId) return;

  const { rule, match } = context;
  const body = await readJson(response);
  const idFromBody = typeof body?.['id'] === 'string' ? body['id'] : undefined;
  const entityId =
    rule.id === 'body'
      ? idFromBody
      : rule.id === 'org'
        ? organizationId
        : (pathId(rule, match) ?? idFromBody);
  if (!entityId) return;
  const item = ITEMS[rule.type];
  const now = item?.find(entityId);
  const verb: Verb =
    rule.verb ?? (request.method === 'DELETE' ? 'deleted' : context.before ? 'updated' : 'created');
  const afterRow = verb === 'deleted' ? undefined : (now ?? undefined);
  const beforeRow = verb === 'created' ? undefined : context.before;
  const changes =
    beforeRow || afterRow
      ? diff(beforeRow, afterRow)
      : diff(undefined, await requestFields(request));
  const row = afterRow ?? beforeRow;
  const projectId =
    (row && item?.project ? item.project(row) : (row?.['projectId'] as string | undefined)) ??
    (rule.id === 'project' || (match[1] && rule.path.source.startsWith('^\\/projects'))
      ? match[1]
      : undefined);
  const entityLabel =
    (row && item?.label?.(row)) ??
    ((body?.['key'] ?? body?.['code'] ?? body?.['name'] ?? body?.['title']) as string | undefined);

  const record = audit({
    ...common,
    action: `${rule.type}.${verb}`,
    entityType: rule.type,
    entityId,
    ...(entityLabel ? { entityLabel } : {}),
    ...(projectId ? { projectId } : {}),
    outcome: 'SUCCESS',
    changes,
  });

  if (projectId && ACTIVITY_TYPES.has(rule.type)) {
    const entry = {
      id: crypto.randomUUID(),
      organizationId,
      projectId,
      occurredAt: record.occurredAt,
      actorId,
      action: record.action,
      entityType: rule.type,
      entityId,
      ...(entityLabel ? { entityLabel } : {}),
      changedFields: verb === 'updated' ? Object.keys(changes) : [],
    };
    db.state.activity.push(entry);
    broker.toProject(projectId, toActivityEntry(entry));
  }

  notifyFor(
    rule.type,
    actorId,
    organizationId,
    projectId,
    entityId,
    beforeRow,
    afterRow,
    entityLabel,
  );
  db.save();
}

/** The notifications a change sends (feature 18's types). */
function notifyFor(
  type: string,
  actorId: string,
  organizationId: string,
  projectId: string | undefined,
  entityId: string,
  beforeRow: Row | undefined,
  afterRow: Row | undefined,
  key: string | undefined,
): void {
  const project = (path: string) => `/projects/${projectId ?? ''}${path}`;
  if (type === 'task' && afterRow) {
    const task = afterRow as unknown as TaskRecord;
    const previous = beforeRow as unknown as TaskRecord | undefined;
    if (
      task.assigneeId &&
      task.assigneeId !== previous?.assigneeId &&
      task.assigneeId !== actorId
    ) {
      notify(
        task.assigneeId,
        organizationId,
        'TASK_ASSIGNED',
        { key, title: task.title, actorId },
        project(`/tasks/${entityId}`),
      );
    }
  }
  if (type === 'change-request' && afterRow) {
    const request = afterRow as unknown as ChangeRequestRecord;
    const previous = beforeRow as unknown as ChangeRequestRecord | undefined;
    const link = project(`/change-requests/${entityId}`);
    for (const membership of db.state.memberships) {
      if (membership.organizationId !== organizationId || membership.userId === actorId) continue;
      if (awaits(request, membership) && !(previous && awaits(previous, membership))) {
        notify(
          membership.userId,
          organizationId,
          'APPROVAL_REQUESTED',
          { key, title: request.title, requesterId: request.requestedById },
          link,
        );
      }
    }
    const decided = (status?: string) => status === 'APPROVED' || status === 'REJECTED';
    if (previous && !decided(previous.status) && decided(request.status)) {
      if (request.requestedById !== actorId) {
        notify(
          request.requestedById,
          organizationId,
          'CHANGE_REQUEST_DECIDED',
          { key, title: request.title, approved: request.status === 'APPROVED', actorId },
          link,
        );
      }
    }
  }
  if (type === 'timesheet' && afterRow) {
    const sheet = afterRow as unknown as TimesheetRecord;
    const previous = beforeRow as unknown as TimesheetRecord | undefined;
    const decided = sheet.status === 'APPROVED' || sheet.status === 'REJECTED';
    if (decided && previous?.status === 'SUBMITTED') {
      const week = isoWeekOf(sheet.weekStart);
      notify(
        sheet.userId,
        organizationId,
        'TIMESHEET_DECIDED',
        {
          week,
          approved: sheet.status === 'APPROVED',
          ...(sheet.comment && sheet.status === 'REJECTED' ? { comment: sheet.comment } : {}),
          actorId,
        },
        `/timesheets/${week}`,
      );
    }
  }
}

async function readJson(response: Response): Promise<Row | null> {
  try {
    const text = await response.clone().text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Row) : null;
  } catch {
    return null;
  }
}

/** For items the mock can't look up: the request's scalar fields, as "after" values. */
async function requestFields(request: Request): Promise<Row | undefined> {
  try {
    const text = await request.clone().text();
    const parsed: unknown = text ? JSON.parse(text) : undefined;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Row)
      : undefined;
  } catch {
    return undefined;
  }
}
