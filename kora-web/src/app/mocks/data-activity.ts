import {
  AttachmentOwnerType,
  AttachmentStatus,
  AuditOutcome,
  FieldChange,
  NotificationType,
  ReportFormat,
  ReportParams,
  ReportStatus,
  ReportType,
  ScanStatus,
} from '../core/api/api.models';
import { chainHash } from './audit-chain';
import { MembershipRecord, ORG_AKAGERA, USER } from './data';
import { CHANGE_REQUEST, ISSUE, RISK } from './data-governance';
import { PEOPLE, PROJECT } from './data-projects';
import { SPRINT, TaskRecord } from './data-work';

/**
 * Features 18–21 in the mock: notifications, the activity feed, the audit trail, attachments and
 * report jobs. New rows come from `outbox.ts` after each successful change, like the API's
 * transactional outbox; this file seeds a few days of history for the demo.
 */

export interface NotificationRecord {
  id: string;
  organizationId: string;
  userId: string;
  type: NotificationType;
  titleKey: string;
  params: Record<string, unknown>;
  link?: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationPreferenceRecord {
  userId: string;
  type: NotificationType;
  inApp: boolean;
  email: boolean;
}

export interface ActivityRecord {
  id: string;
  organizationId: string;
  projectId: string;
  occurredAt: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  changedFields: string[];
}

export interface AuditRecord {
  id: string;
  organizationId: string;
  occurredAt: string;
  actorId?: string;
  actorIp?: string;
  userAgent?: string;
  correlationId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  projectId?: string;
  outcome: AuditOutcome;
  changes: Record<string, FieldChange>;
  /** Hash of the previous row's hash and this row (the tamper-evident chain). */
  hash: string;
}

export interface AttachmentRecord {
  id: string;
  organizationId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  projectId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
  status: AttachmentStatus;
  scanStatus: ScanStatus;
  uploadedById: string;
  uploadedAt: string;
  /** Random, never the file name. */
  storageKey: string;
  /** Soft-deleted; the API purges after 30 days. */
  deletedAt?: string;
}

export interface ReportJobRecord {
  id: string;
  organizationId: string;
  userId: string;
  type: ReportType;
  format: ReportFormat;
  params: ReportParams;
  status: ReportStatus;
  fileName?: string;
  sizeBytes?: number;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  failureReason?: string;
}

export interface ActivitySeed {
  notifications: NotificationRecord[];
  notificationPreferences: NotificationPreferenceRecord[];
  activity: ActivityRecord[];
  audit: AuditRecord[];
  attachments: AttachmentRecord[];
  reportJobs: ReportJobRecord[];
}

const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export const NOTIFICATION = (n: number) => id('9a1b2c3d', n);
export const ACTIVITY = (n: number) => id('9b1b2c3d', n);
export const AUDIT = (n: number) => id('9c1b2c3d', n);
export const ATTACHMENT = (n: number) => id('9d1b2c3d', n);

/** The masked address the demo's changes come from (the API zeroes the last octet). */
export const DEMO_IP = '41.186.12.0';
const HOUR = 3_600_000;

export function createActivitySeed(
  now: number,
  tasks: readonly TaskRecord[],
  memberships: readonly MembershipRecord[],
): ActivitySeed {
  const at = (hours: number) => new Date(now - hours * HOUR).toISOString();
  const task = (number: number) => {
    const found = tasks.find((t) => t.projectId === PROJECT.mobile && t.number === number);
    if (!found) throw new Error(`No task ${number}`);
    return found;
  };
  const mobile = (path: string) => `/projects/${PROJECT.mobile}${path}`;

  let notificationNo = 0;
  const notification = (
    userId: string,
    type: NotificationType,
    hours: number,
    params: Record<string, unknown>,
    link: string,
    read = false,
  ): NotificationRecord => ({
    id: NOTIFICATION(++notificationNo),
    organizationId: ORG_AKAGERA,
    userId,
    type,
    titleKey: `notifications.${type.toLowerCase()}`,
    params,
    link,
    createdAt: at(hours),
    ...(read ? { readAt: at(hours - 1) } : {}),
  });

  const pmMembership =
    memberships.find((m) => m.userId === USER.pm && m.organizationId === ORG_AKAGERA)?.id ?? '';
  const t49 = task(49);
  const t43 = task(43);
  const notifications: NotificationRecord[] = [
    // The member: work assigned, an overdue risk review, last week's time approved.
    notification(
      USER.member,
      'TASK_ASSIGNED',
      2,
      { key: 'AKG-001-49', title: t49.title, actorId: USER.pm },
      mobile(`/tasks/${t49.id}`),
    ),
    notification(
      USER.member,
      'RISK_REVIEW_OVERDUE',
      9,
      {
        key: 'AKG-001-R5',
        title: 'The security audit finds critical issues late',
        reviewDate: at(72).slice(0, 10),
      },
      mobile(`/risks/${RISK(5)}`),
    ),
    notification(
      USER.member,
      'TASK_ASSIGNED',
      50,
      { key: 'AKG-001-43', title: t43.title, actorId: USER.pm },
      mobile(`/tasks/${t43.id}`),
      true,
    ),
    // The project manager: a change request to decide, a decision on theirs.
    notification(
      USER.pm,
      'APPROVAL_REQUESTED',
      26,
      { key: 'AKG-001-CR3', title: 'Extend the staff beta by two weeks', requesterId: USER.member },
      mobile(`/change-requests/${CHANGE_REQUEST(3)}`),
    ),
    notification(
      USER.pm,
      'CHANGE_REQUEST_DECIDED',
      75,
      {
        key: 'AKG-001-CR1',
        title: 'Add fingerprint sign-in',
        approved: true,
        actorId: USER.pmo,
      },
      mobile(`/change-requests/${CHANGE_REQUEST(1)}`),
      true,
    ),
    // The PMO: a change waiting at their step, an escalated issue.
    notification(
      USER.pmo,
      'APPROVAL_REQUESTED',
      20,
      { key: 'AKG-001-CR2', title: 'Add utility bill payments', requesterId: USER.pm },
      mobile(`/change-requests/${CHANGE_REQUEST(2)}`),
    ),
    notification(
      USER.pmo,
      'ISSUE_ESCALATED',
      30,
      { key: 'AKG-001-I2', title: 'Push notifications arrive up to an hour late' },
      mobile(`/issues/${ISSUE(2)}`),
    ),
  ];

  let activityNo = 0;
  const activity: ActivityRecord[] = [];
  const audit: AuditRecord[] = [];
  let previous = '';
  const record = (
    hours: number,
    actorId: string | undefined,
    entityType: string,
    verb: 'created' | 'updated' | 'deleted',
    entityId: string,
    entityLabel: string | undefined,
    changes: Record<string, FieldChange>,
    projectId: string | null = PROJECT.mobile,
    outcome: AuditOutcome = 'SUCCESS',
  ) => {
    const occurredAt = at(hours);
    const action = entityType === 'request' ? 'access.denied' : `${entityType}.${verb}`;
    const row: Omit<AuditRecord, 'hash'> = {
      id: AUDIT(audit.length + 1),
      organizationId: ORG_AKAGERA,
      occurredAt,
      ...(actorId ? { actorId } : {}),
      actorIp: DEMO_IP,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0',
      correlationId: crypto.randomUUID().replaceAll('-', ''),
      action,
      entityType,
      entityId,
      ...(entityLabel ? { entityLabel } : {}),
      ...(projectId ? { projectId } : {}),
      outcome,
      changes,
    };
    previous = chainHash(previous, row);
    audit.push({ ...row, hash: previous });
    if (projectId && outcome === 'SUCCESS' && ACTIVITY_TYPES.has(entityType)) {
      activity.push({
        id: ACTIVITY(++activityNo),
        organizationId: ORG_AKAGERA,
        projectId,
        occurredAt,
        ...(actorId ? { actorId } : {}),
        action,
        entityType,
        entityId,
        ...(entityLabel ? { entityLabel } : {}),
        changedFields: Object.keys(changes).filter(() => verb === 'updated'),
      });
    }
  };

  // Oldest first, so the hash chain runs forward in time.
  record(150, USER.pm, 'sprint', 'updated', SPRINT.active, 'Sprint 5', {
    status: { before: 'PLANNED', after: 'ACTIVE' },
  });
  record(120, PEOPLE.odette, 'task', 'updated', task(52).id, 'AKG-001-52', {
    status: { before: 'TODO', after: 'IN_PROGRESS' },
  });
  record(96, USER.member, 'issue', 'created', ISSUE(1), 'AKG-001-I1', {
    title: { after: 'Sign-in fails on Android 10 devices' },
    priority: { after: 'HIGH' },
  });
  record(
    80,
    USER.admin,
    'membership',
    'updated',
    pmMembership,
    'Grace Mukamana',
    {
      role: { before: 'MEMBER', after: 'PROJECT_MANAGER' },
    },
    null,
  );
  record(75, USER.pmo, 'change-request', 'updated', CHANGE_REQUEST(1), 'AKG-001-CR1', {
    status: { before: 'IN_REVIEW', after: 'APPROVED' },
  });
  record(50, USER.pm, 'task', 'updated', t43.id, 'AKG-001-43', {
    assigneeId: { after: USER.member },
  });
  record(30, undefined, 'issue', 'updated', ISSUE(2), 'AKG-001-I2', {
    escalated: { before: false, after: true },
  });
  record(28, USER.pm, 'risk', 'updated', RISK(1), 'AKG-001-R1', {
    responsePlan: {
      before: 'Follow the stores’ guidelines.',
      after: 'Run the stores’ pre-submission checklist; submit a beta two weeks early.',
    },
    status: { before: 'IDENTIFIED', after: 'RESPONSE_PLANNED' },
  });
  record(26, USER.member, 'change-request', 'updated', CHANGE_REQUEST(3), 'AKG-001-CR3', {
    status: { before: 'DRAFT', after: 'SUBMITTED' },
  });
  record(24, USER.pm, 'attachment', 'created', ATTACHMENT(1), 'Signed charter.pdf', {
    fileName: { after: 'Signed charter.pdf' },
  });
  record(
    12,
    USER.viewer,
    'request',
    'created',
    PROJECT.mobile,
    `POST /api/v1/projects/${PROJECT.mobile}/stakeholders`,
    {},
    PROJECT.mobile,
    'DENIED',
  );
  record(5, USER.member, 'task', 'updated', task(41).id, 'AKG-001-41', {
    status: { before: 'IN_PROGRESS', after: 'IN_REVIEW' },
    remainingHours: { before: 6, after: 2 },
  });
  record(2, USER.pm, 'task', 'updated', t49.id, 'AKG-001-49', {
    assigneeId: { after: USER.member },
  });
  activity.reverse();

  const attachments: AttachmentRecord[] = [
    {
      id: ATTACHMENT(1),
      organizationId: ORG_AKAGERA,
      ownerType: 'PROJECT',
      ownerId: PROJECT.mobile,
      projectId: PROJECT.mobile,
      fileName: 'Signed charter.pdf',
      contentType: 'application/pdf',
      sizeBytes: 184_320,
      sha256: 'b3f1c0a9d2e84f7a9c6b5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
      status: 'AVAILABLE',
      scanStatus: 'NOT_SCANNED',
      uploadedById: USER.pm,
      uploadedAt: at(24),
      storageKey: `${ORG_AKAGERA}/${crypto.randomUUID()}`,
    },
    {
      id: ATTACHMENT(2),
      organizationId: ORG_AKAGERA,
      ownerType: 'RISK',
      ownerId: RISK(1),
      projectId: PROJECT.mobile,
      fileName: 'Store review checklist.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 23_552,
      status: 'AVAILABLE',
      scanStatus: 'NOT_SCANNED',
      uploadedById: USER.pm,
      uploadedAt: at(28),
      storageKey: `${ORG_AKAGERA}/${crypto.randomUUID()}`,
    },
  ];

  return {
    notifications,
    notificationPreferences: [],
    activity,
    audit,
    attachments,
    reportJobs: [],
  };
}

/** Entity types that appear in a project's activity feed (the API's list). */
export const ACTIVITY_TYPES = new Set([
  'project',
  'allocation',
  'attachment',
  'baseline',
  'board-column',
  'change-request',
  'charter',
  'dependency',
  'evm-settings',
  'issue',
  'project-member',
  'report-job',
  'risk',
  'sprint',
  'stakeholder',
  'task',
  'timesheet',
  'wbs-node',
]);
