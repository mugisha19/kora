import { http } from 'msw';
import {
  ISSUE_PRIORITIES,
  ISSUE_SORT_FIELDS,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  Issue,
  IssuePriority,
  IssueType,
} from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { IssueRecord } from '../data-governance';
import { ProjectRecord } from '../data-projects';
import { db } from '../db';
import { canManageIssue, isUnresolved, orgMember, toIssue } from '../governance-domain';
import {
  API,
  Reply,
  Validator,
  checkPathId,
  checkVersion,
  ifMatchVersion,
  invalidBody,
  latency,
  paging,
  readBody,
  reply,
  sortAndPage,
} from '../http';
import { canSee } from '../projects-domain';
import { manages, participates } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

/** The issue named in the path, if the caller can see its project (404 otherwise). */
function visibleIssue(
  r: Reply,
  membership: MembershipRecord,
  issueId: unknown,
): { issue: IssueRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'issueId', issueId);
  if (badId) return badId;
  const issue = db.state.issues.find((i) => i.id === issueId);
  const project = issue && db.state.projects.find((p) => p.id === issue.projectId);
  return issue && project && canSee(project, membership)
    ? { issue, project }
    : r.problem(404, 'resource.not_found');
}

function issueShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0) {
    v.add('body', 'required', 'send at least one field');
  }
  if (creating || body['title'] !== undefined) v.string('title', body['title'], 1, 200);
  if (body['description'] !== undefined) {
    v.string('description', body['description'], 0, 4000, false);
  }
  if (creating || body['type'] !== undefined) v.oneOf('type', body['type'], ISSUE_TYPES);
  if (creating || body['priority'] !== undefined) {
    v.oneOf('priority', body['priority'], ISSUE_PRIORITIES);
  }
  v.uuid('ownerId', body['ownerId']);
  v.date('dueDate', body['dueDate']);
  if (!creating && body['status'] !== undefined) {
    v.oneOf('status', body['status'], ['OPEN', 'IN_PROGRESS'] as const);
  }
}

function checkOwner(r: Reply, body: Record<string, unknown>, project: ProjectRecord) {
  const ownerId = body['ownerId'];
  if (typeof ownerId === 'string' && !orgMember(project.organizationId, ownerId)) {
    const v = new Validator();
    v.add('ownerId', 'invalid', 'is not a member of this organization');
    return v.problem(r);
  }
  return null;
}

function apply(issue: IssueRecord, body: Record<string, unknown>): void {
  if (body['title'] !== undefined) issue.title = String(body['title']).trim();
  if (body['description'] !== undefined) issue.description = String(body['description']);
  if (body['type'] !== undefined) issue.type = body['type'] as IssueType;
  if (body['priority'] !== undefined) issue.priority = body['priority'] as IssuePriority;
  if (body['ownerId'] !== undefined) issue.ownerId = String(body['ownerId']);
  if (body['dueDate'] !== undefined) issue.dueDate = String(body['dueDate']);
  if (body['status'] === 'OPEN' || body['status'] === 'IN_PROGRESS') issue.status = body['status'];
}

const invalidTransition = (r: Reply) => r.problem(409, 'issues.invalid_transition');

export const issueHandlers = [
  http.get(`${API}/projects/:projectId/issues`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const get = (name: string) => url.searchParams.get(name) ?? undefined;
    const v = new Validator();
    v.oneOf('status', get('status'), ISSUE_STATUSES, false);
    v.oneOf('priority', get('priority'), ISSUE_PRIORITIES, false);
    v.uuid('ownerId', get('ownerId'));
    v.oneOf('overdue', get('overdue'), ['true', 'false'] as const, false);
    const page = paging(url, ISSUE_SORT_FIELDS, 'priority,asc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    // "Most urgent first": priority, then the nearest due date.
    if (!url.searchParams.getAll('sort').length) page.sort.push({ field: 'dueDate', direction: 1 });

    const q = get('q')?.trim().toLowerCase() ?? '';
    const issues = db.state.issues
      .filter((i) => i.projectId === project.id)
      .filter((i) => !get('status') || i.status === get('status'))
      .filter((i) => !get('priority') || i.priority === get('priority'))
      .filter((i) => !get('ownerId') || i.ownerId === get('ownerId'))
      .map((i) => toIssue(i))
      .filter((i) => get('overdue') !== 'true' || i.overdue)
      .filter((i) => !q || i.title.toLowerCase().includes(q) || i.key.toLowerCase().includes(q));
    return r.json(
      sortAndPage(issues, page, {
        priority: (i: Issue) => ISSUE_PRIORITIES.indexOf(i.priority),
        dueDate: (i: Issue) => i.dueDate ?? '9999-12-31',
        key: (i: Issue) => Number(i.key.split('-I').pop()),
        createdAt: (i: Issue) => i.createdAt,
      }),
    );
  }),

  http.post(`${API}/projects/:projectId/issues`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    issueShape(v, body, true);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!participates(project, membership)) return r.problem(403, 'access.denied');
    const badOwner = checkOwner(r, body, project);
    if (badOwner) return badOwner;

    const issue: IssueRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number:
        Math.max(
          0,
          ...db.state.issues.filter((i) => i.projectId === project.id).map((i) => i.number),
        ) + 1,
      title: '',
      type: body['type'] as IssueType,
      priority: body['priority'] as IssuePriority,
      status: 'OPEN',
      raisedById: membership.userId,
      createdAt: new Date().toISOString(),
      version: 1,
    };
    apply(issue, body);
    db.state.issues.push(issue);
    db.save();
    return r.json(toIssue(issue), 201, { Location: `/api/v1/issues/${issue.id}` });
  }),

  http.get(`${API}/issues/:issueId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleIssue(r, membership, params['issueId']);
    if (found instanceof Response) return found;
    return r.json(toIssue(found.issue));
  }),

  http.patch(`${API}/issues/:issueId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    issueShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const found = visibleIssue(r, membership, params['issueId']);
    if (found instanceof Response) return found;
    const { issue, project } = found;
    if (!canManageIssue(issue, project, membership)) return r.problem(403, 'access.denied');
    if (!isUnresolved(issue)) return invalidTransition(r);
    const stale = checkVersion(r, sent, issue.version);
    if (stale) return stale;
    const badOwner = checkOwner(r, body, project);
    if (badOwner) return badOwner;

    apply(issue, body);
    issue.version += 1;
    db.save();
    return r.json(toIssue(issue));
  }),

  http.post(`${API}/issues/:issueId/resolve`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('resolution', body['resolution'], 1, 4000);
    if (!v.ok) return v.problem(r);
    const found = visibleIssue(r, membership, params['issueId']);
    if (found instanceof Response) return found;
    const { issue, project } = found;
    if (!canManageIssue(issue, project, membership)) return r.problem(403, 'access.denied');
    if (!isUnresolved(issue)) return invalidTransition(r);

    issue.status = 'RESOLVED';
    issue.resolution = String(body['resolution']).trim();
    issue.resolvedAt = new Date().toISOString();
    issue.version += 1;
    db.save();
    return r.json(toIssue(issue));
  }),

  http.post(`${API}/issues/:issueId/close`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleIssue(r, membership, params['issueId']);
    if (found instanceof Response) return found;
    const { issue, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (issue.status !== 'RESOLVED') return invalidTransition(r);

    issue.status = 'CLOSED';
    issue.version += 1;
    db.save();
    return r.json(toIssue(issue));
  }),

  http.post(`${API}/issues/:issueId/reopen`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.string('reason', body['reason'], 1, 1000);
    if (!v.ok) return v.problem(r);
    const found = visibleIssue(r, membership, params['issueId']);
    if (found instanceof Response) return found;
    const { issue, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (isUnresolved(issue)) return invalidTransition(r);

    issue.status = 'OPEN';
    delete issue.resolution;
    delete issue.resolvedAt;
    issue.version += 1;
    db.save();
    return r.json(toIssue(issue));
  }),
];
