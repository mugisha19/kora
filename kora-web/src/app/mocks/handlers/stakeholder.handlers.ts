import { http } from 'msw';
import {
  ENGAGEMENTS,
  Engagement,
  STAKEHOLDER_QUADRANTS,
  StakeholderGridEntry,
} from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { StakeholderRecord } from '../data-governance';
import { ProjectRecord } from '../data-projects';
import { db } from '../db';
import { anonymize, orgMember, toStakeholder } from '../governance-domain';
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
import { manages } from '../work-domain';
import { caller } from './portfolio.handlers';
import { visibleProject } from './project.handlers';

const PHONE = /^[+0-9 ()-]{3,40}$/;

function visibleStakeholder(
  r: Reply,
  membership: MembershipRecord,
  stakeholderId: unknown,
): { stakeholder: StakeholderRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'stakeholderId', stakeholderId);
  if (badId) return badId;
  const stakeholder = db.state.stakeholders.find((s) => s.id === stakeholderId);
  const project = stakeholder && db.state.projects.find((p) => p.id === stakeholder.projectId);
  return stakeholder && project && canSee(project, membership)
    ? { stakeholder, project }
    : r.problem(404, 'resource.not_found');
}

function level(v: Validator, field: string, value: unknown, required: boolean): void {
  if (value === undefined || value === null) {
    if (required) v.add(field, 'required', `${field} is required`);
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    v.add(field, 'invalid', 'must be a whole number');
  } else v.number(field, value, 1, 5);
}

function stakeholderShape(v: Validator, body: Record<string, unknown>, creating: boolean): void {
  if (!creating && Object.keys(body).length === 0) {
    v.add('body', 'required', 'send at least one field');
  }
  if (creating || body['name'] !== undefined) v.string('name', body['name'], 1, 200);
  for (const [field, max] of [
    ['organization', 200],
    ['role', 200],
    ['communicationPreferences', 1000],
    ['notes', 4000],
  ] as const) {
    if (body[field] !== undefined) v.string(field, body[field], 0, max, false);
  }
  if (body['email'] !== undefined && body['email'] !== '') v.email('email', body['email']);
  if (body['phone'] !== undefined && body['phone'] !== '') {
    v.pattern('phone', body['phone'], PHONE, true);
  }
  v.uuid('userId', body['userId']);
  level(v, 'power', body['power'], creating);
  level(v, 'interest', body['interest'], creating);
  level(v, 'influence', body['influence'], false);
  if (creating || body['currentEngagement'] !== undefined) {
    v.oneOf('currentEngagement', body['currentEngagement'], ENGAGEMENTS);
  }
  if (creating || body['desiredEngagement'] !== undefined) {
    v.oneOf('desiredEngagement', body['desiredEngagement'], ENGAGEMENTS);
  }
}

function apply(record: StakeholderRecord, body: Record<string, unknown>): void {
  type TextField =
    'organization' | 'role' | 'email' | 'phone' | 'communicationPreferences' | 'notes';
  // An empty string clears the field.
  const text = (field: TextField) => {
    if (body[field] !== undefined) record[field] = String(body[field]).trim() || undefined;
  };
  if (body['name'] !== undefined) record.name = String(body['name']).trim();
  text('organization');
  text('role');
  text('email');
  text('phone');
  text('communicationPreferences');
  text('notes');
  if (body['userId'] !== undefined) record.userId = String(body['userId']);
  for (const field of ['power', 'interest', 'influence'] as const) {
    if (body[field] !== undefined) record[field] = Number(body[field]);
  }
  if (body['currentEngagement'] !== undefined) {
    record.currentEngagement = body['currentEngagement'] as Engagement;
  }
  if (body['desiredEngagement'] !== undefined) {
    record.desiredEngagement = body['desiredEngagement'] as Engagement;
  }
}

function checkUser(r: Reply, body: Record<string, unknown>, project: ProjectRecord) {
  const userId = body['userId'];
  if (typeof userId === 'string' && !orgMember(project.organizationId, userId)) {
    const v = new Validator();
    v.add('userId', 'invalid', 'is not a member of this organization');
    return v.problem(r);
  }
  return null;
}

const listed = (projectId: string) =>
  db.state.stakeholders.filter((s) => s.projectId === projectId && !s.removed);

export const stakeholderHandlers = [
  http.get(`${API}/projects/:projectId/stakeholders/grid`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const views = listed(project.id)
      .map(toStakeholder)
      .sort((a, b) => a.name.localeCompare(b.name));
    return r.json({
      projectId: project.id,
      quadrants: STAKEHOLDER_QUADRANTS.map((quadrant) => ({
        quadrant,
        stakeholders: views
          .filter((s) => s.quadrant === quadrant)
          .map((s): StakeholderGridEntry => ({
            id: s.id,
            name: s.name,
            power: s.power,
            interest: s.interest,
            engagementGap: s.engagementGap,
          })),
      })),
    });
  }),

  http.get(`${API}/projects/:projectId/stakeholders`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const quadrant = url.searchParams.get('quadrant') ?? undefined;
    const gap = url.searchParams.get('gap') ?? undefined;
    const v = new Validator();
    v.oneOf('quadrant', quadrant, STAKEHOLDER_QUADRANTS, false);
    v.oneOf('gap', gap, ['true', 'false'] as const, false);
    const page = paging(url, ['name'], 'name,asc', v);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;

    const stakeholders = listed(project.id)
      .map(toStakeholder)
      .filter((s) => !quadrant || s.quadrant === quadrant)
      .filter((s) => gap !== 'true' || s.engagementGap > 0);
    return r.json(sortAndPage(stakeholders, page, { name: (s) => s.name }));
  }),

  http.post(`${API}/projects/:projectId/stakeholders`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    stakeholderShape(v, body, true);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const badUser = checkUser(r, body, project);
    if (badUser) return badUser;

    const record: StakeholderRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: '',
      power: 1,
      interest: 1,
      currentEngagement: 'NEUTRAL',
      desiredEngagement: 'NEUTRAL',
      removed: false,
      version: 1,
    };
    apply(record, body);
    db.state.stakeholders.push(record);
    db.save();
    return r.json(toStakeholder(record), 201, {
      Location: `/api/v1/stakeholders/${record.id}`,
    });
  }),

  http.get(`${API}/stakeholders/:stakeholderId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleStakeholder(r, membership, params['stakeholderId']);
    if (found instanceof Response) return found;
    return r.json(toStakeholder(found.stakeholder));
  }),

  http.patch(`${API}/stakeholders/:stakeholderId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    stakeholderShape(v, body, false);
    if (!v.ok) return v.problem(r);
    const found = visibleStakeholder(r, membership, params['stakeholderId']);
    if (found instanceof Response) return found;
    const { stakeholder, project } = found;
    if (stakeholder.removed) return r.problem(404, 'resource.not_found');
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    const stale = checkVersion(r, sent, stakeholder.version);
    if (stale) return stale;
    const badUser = checkUser(r, body, project);
    if (badUser) return badUser;

    apply(stakeholder, body);
    stakeholder.version += 1;
    db.save();
    return r.json(toStakeholder(stakeholder));
  }),

  http.delete(`${API}/stakeholders/:stakeholderId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const found = visibleStakeholder(r, membership, params['stakeholderId']);
    if (found instanceof Response) return found;
    const { stakeholder, project } = found;
    if (!manages(project, membership)) return r.problem(403, 'access.denied');
    if (!stakeholder.removed) anonymize(stakeholder);
    db.save();
    return r.empty(204);
  }),
];
