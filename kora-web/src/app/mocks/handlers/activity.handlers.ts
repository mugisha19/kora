import { http } from 'msw';
import { NOTIFICATION_TYPES, NotificationType } from '../../core/api/api.models';
import { verifyChain } from '../audit-chain';
import { db } from '../db';
import {
  API,
  Validator,
  authenticate,
  cursorPage,
  invalidBody,
  latency,
  readBody,
  reply,
} from '../http';
import { toActivityEntry, toAuditEvent, toNotification } from '../outbox';
import { canSee } from '../projects-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

/** Email is on by default only for what needs action soon (the API's defaults). */
const EMAIL_BY_DEFAULT: readonly NotificationType[] = ['APPROVAL_REQUESTED', 'TASK_ASSIGNED'];
const ENTITY_TYPE = /^[a-z][a-z-]{1,40}$/;

function preferencesOf(userId: string) {
  return {
    preferences: NOTIFICATION_TYPES.map((type) => {
      const saved = db.state.notificationPreferences.find(
        (p) => p.userId === userId && p.type === type,
      );
      return saved
        ? { type, inApp: saved.inApp, email: saved.email }
        : { type, inApp: true, email: EMAIL_BY_DEFAULT.includes(type) };
    }),
  };
}

/** Features 18–19: notifications and preferences, the activity feed, history and the audit log. */
export const activityHandlers = [
  http.get(`${API}/notifications`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const unread = url.searchParams.get('unread');
    if (unread !== null && unread !== 'true' && unread !== 'false') return invalidUnread(r);
    const mine = db.state.notifications
      .filter(
        (n) => n.userId === membership.userId && n.organizationId === membership.organizationId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const listed = unread === 'true' ? mine.filter((n) => !n.readAt) : mine;
    const page = cursorPage(r, url, listed);
    if (page instanceof Response) return page;
    return r.json({
      items: page.items.map(toNotification),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      unreadCount: mine.filter((n) => !n.readAt).length,
    });
  }),

  http.post(`${API}/notifications/read-all`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const now = new Date().toISOString();
    for (const n of db.state.notifications) {
      if (n.userId === membership.userId && n.organizationId === membership.organizationId) {
        n.readAt ??= now;
      }
    }
    db.save();
    return r.empty();
  }),

  http.post(`${API}/notifications/:notificationId/read`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const notification = db.state.notifications.find(
      (n) =>
        n.id === params['notificationId'] &&
        n.userId === membership.userId &&
        n.organizationId === membership.organizationId,
    );
    if (!notification) return r.problem(404, 'resource.not_found');
    notification.readAt ??= new Date().toISOString();
    db.save();
    return r.json(toNotification(notification));
  }),

  // Per person, across organizations: no organization header.
  http.get(`${API}/me/notification-preferences`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    return r.json(preferencesOf(userId));
  }),

  http.put(`${API}/me/notification-preferences`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const list = body['preferences'];
    if (!Array.isArray(list)) {
      v.add('preferences', 'required', 'must be a list');
      return v.problem(r);
    }
    list.forEach((item: unknown, i) => {
      const p = (item ?? {}) as Record<string, unknown>;
      if (!NOTIFICATION_TYPES.includes(p['type'] as NotificationType)) {
        v.add(`preferences[${i}].type`, 'invalid', 'is not a notification type');
      }
      for (const field of ['inApp', 'email']) {
        if (typeof p[field] !== 'boolean') {
          v.add(`preferences[${i}].${field}`, 'required', 'must be true or false');
        }
      }
    });
    if (!v.ok) return v.problem(r);
    for (const item of list as { type: NotificationType; inApp: boolean; email: boolean }[]) {
      const saved = db.state.notificationPreferences.find(
        (p) => p.userId === userId && p.type === item.type,
      );
      if (saved) Object.assign(saved, { inApp: item.inApp, email: item.email });
      else db.state.notificationPreferences.push({ userId, ...item });
    }
    db.save();
    return r.json(preferencesOf(userId));
  }),

  http.get(`${API}/projects/:projectId/activity`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const entries = db.state.activity
      .filter((a) => a.projectId === project.id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const page = cursorPage(r, new URL(request.url), entries);
    if (page instanceof Response) return page;
    return r.json({
      items: page.items.map(toActivityEntry),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    });
  }),

  http.get(`${API}/history/:entityType/:entityId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const v = new Validator();
    v.pattern('entityType', params['entityType'], ENTITY_TYPE, true);
    v.uuid('entityId', params['entityId'], true);
    if (!v.ok) return v.problem(r);
    const rows = db.state.audit.filter(
      (a) =>
        a.organizationId === membership.organizationId &&
        a.entityType === params['entityType'] &&
        a.entityId === params['entityId'] &&
        a.outcome === 'SUCCESS',
    );
    if (!rows.length) return r.problem(404, 'resource.not_found');
    // The item's project decides who may read; items without one are for the admin and the PMO.
    const projectId = rows.find((a) => a.projectId)?.projectId;
    const project = projectId ? db.state.projects.find((p) => p.id === projectId) : undefined;
    const allowed = project
      ? canSee(project, membership)
      : membership.role === 'ORG_ADMIN' || membership.role === 'PMO';
    if (!allowed) return r.problem(404, 'resource.not_found');
    return r.json(
      [...rows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map(toAuditEvent),
    );
  }),

  http.get(`${API}/audit/verify`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    if (membership.role !== 'ORG_ADMIN') return r.problem(403, 'access.denied');
    const url = new URL(request.url);
    const v = new Validator();
    v.date('from', url.searchParams.get('from') ?? undefined);
    v.date('to', url.searchParams.get('to') ?? undefined);
    if (!v.ok) return v.problem(r);
    const chain = db.state.audit.filter((a) => a.organizationId === membership.organizationId);
    const result = verifyChain(chain);
    return r.json({ valid: !result.firstBrokenId, ...result });
  }),

  http.get(`${API}/audit`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    if (membership.role !== 'ORG_ADMIN') return r.problem(403, 'access.denied');
    const url = new URL(request.url);
    const q = (name: string) => url.searchParams.get(name) ?? undefined;
    const v = new Validator();
    v.uuid('actorId', q('actorId'));
    v.uuid('entityId', q('entityId'));
    v.date('from', q('from'));
    v.date('to', q('to'));
    if (!v.ok) return v.problem(r);
    const from = q('from');
    const to = q('to');
    const rows = db.state.audit
      .filter(
        (a) =>
          a.organizationId === membership.organizationId &&
          (!q('actorId') || a.actorId === q('actorId')) &&
          (!q('entityType') || a.entityType === q('entityType')) &&
          (!q('entityId') || a.entityId === q('entityId')) &&
          (!q('action') || a.action === q('action')) &&
          (!from || a.occurredAt.slice(0, 10) >= from) &&
          (!to || a.occurredAt.slice(0, 10) <= to),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const page = cursorPage(r, url, rows);
    if (page instanceof Response) return page;
    return r.json({
      items: page.items.map(toAuditEvent),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    });
  }),
];

function invalidUnread(r: ReturnType<typeof reply>): Response {
  const v = new Validator();
  v.add('unread', 'invalid', 'must be true or false');
  return v.problem(r);
}
