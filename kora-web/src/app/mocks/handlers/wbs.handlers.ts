import { http } from 'msw';
import { WBS_MAX_DEPTH, WbsNodeType } from '../../core/api/api.models';
import { MembershipRecord } from '../data';
import { ProjectRecord, WbsNodeRecord } from '../data-projects';
import { db, must } from '../db';
import { currencyDigits } from '../decimal';
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
} from '../http';
import {
  canSee,
  childrenOf,
  compactPositions,
  depthOf,
  isDescendant,
  orgCurrency,
  subtreeHeight,
  wbsNodeView,
  wbsTree,
} from '../projects-domain';
import { caller } from './portfolio.handlers';
import { requireEditor, visibleProject } from './project.handlers';

const FIGURES = ['plannedEffortHours', 'plannedCost', 'percentComplete'] as const;
const AMOUNT = /^[0-9]{1,15}(\.[0-9]{1,4})?$/;

function nodeShape(
  v: Validator,
  body: Record<string, unknown>,
  creating: boolean,
  currency: string,
) {
  if (!creating && Object.keys(body).length === 0)
    v.add('body', 'required', 'send at least one field');
  if (creating) v.uuid('parentId', body['parentId']);
  if (creating || body['name'] !== undefined) v.string('name', body['name'], 1, 200);
  if (body['description'] !== undefined)
    v.string('description', body['description'], 0, 4000, false);
  if (creating || body['type'] !== undefined) {
    v.oneOf('type', body['type'], ['DELIVERABLE', 'WORK_PACKAGE'] as const);
  }
  v.uuid('ownerId', body['ownerId']);
  v.number('plannedEffortHours', body['plannedEffortHours'], 0, 1_000_000);
  v.number('percentComplete', body['percentComplete'], 0, 100);
  if (
    v.pattern('plannedCost', body['plannedCost'], AMOUNT) &&
    typeof body['plannedCost'] === 'string'
  ) {
    const decimals = body['plannedCost'].split('.')[1]?.replace(/0+$/, '').length ?? 0;
    const digits = currencyDigits(currency);
    if (decimals > digits)
      v.add('plannedCost', 'format', `at most ${digits} decimals for ${currency}`);
  }
  if (creating && body['position'] !== undefined) {
    const position = body['position'];
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
      v.add('position', 'range', 'must be >= 0', { min: 0 });
    }
  }
}

/** Effort, cost and percent belong to work packages; a deliverable's are rolled up. */
function figuresOnDeliverable(
  v: Validator,
  body: Record<string, unknown>,
  type: WbsNodeType,
): void {
  if (type !== 'DELIVERABLE') return;
  for (const field of FIGURES) {
    if (body[field] !== undefined) v.add(field, 'invalid', 'only work packages have this value');
  }
}

/** The node and its project, if the caller can see the project (404 otherwise). */
function visibleNode(
  r: Reply,
  membership: MembershipRecord,
  nodeId: unknown,
): { node: WbsNodeRecord; project: ProjectRecord } | Response {
  const badId = checkPathId(r, 'nodeId', nodeId);
  if (badId) return badId;
  const node = db.state.wbsNodes.find((n) => n.id === nodeId);
  const project = node && db.state.projects.find((p) => p.id === node.projectId);
  return node && project && canSee(project, membership)
    ? { node, project }
    : r.problem(404, 'resource.not_found');
}

/** Puts `node` at `position` among the children of `parentId` (clamped), renumbering them. */
function place(node: WbsNodeRecord, parentId: string | undefined, position: number): void {
  const siblings = childrenOf(node.projectId, parentId).filter((n) => n.id !== node.id);
  siblings.splice(Math.min(position, siblings.length), 0, node);
  if (parentId) node.parentId = parentId;
  else delete node.parentId;
  siblings.forEach((n, index) => (n.position = index));
}

function subtreeIds(nodeId: string): string[] {
  const node = must(
    db.state.wbsNodes.find((n) => n.id === nodeId),
    'wbs node',
  );
  return [nodeId, ...childrenOf(node.projectId, nodeId).flatMap((child) => subtreeIds(child.id))];
}

export const wbsHandlers = [
  http.get(`${API}/projects/:projectId/wbs`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    return r.json(wbsTree(project));
  }),

  http.post(`${API}/projects/:projectId/wbs/nodes`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    nodeShape(v, body, true, orgCurrency(membership.organizationId));
    if (v.ok) figuresOnDeliverable(v, body, body['type'] as WbsNodeType);
    if (!v.ok) return v.problem(r);
    const project = visibleProject(r, membership, params['projectId']);
    if (project instanceof Response) return project;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;

    const parentId = body['parentId'] as string | undefined;
    const parent = parentId
      ? db.state.wbsNodes.find((n) => n.id === parentId && n.projectId === project.id)
      : undefined;
    if (parentId && !parent) return r.problem(404, 'resource.not_found');
    if (parent?.type === 'WORK_PACKAGE') return r.problem(409, 'wbs.parent_not_deliverable');
    if (depthOf(parentId) + 1 > WBS_MAX_DEPTH) return r.problem(409, 'wbs.too_deep');

    const record: WbsNodeRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: String(body['name']).trim(),
      ...(body['description'] ? { description: String(body['description']) } : {}),
      type: body['type'] as WbsNodeType,
      ...(body['ownerId'] ? { ownerId: String(body['ownerId']) } : {}),
      plannedEffortHours: (body['plannedEffortHours'] as number | undefined) ?? 0,
      plannedCost: (body['plannedCost'] as string | undefined) ?? '0',
      percentComplete: (body['percentComplete'] as number | undefined) ?? 0,
      position: Number.MAX_SAFE_INTEGER,
      version: 1,
    };
    db.state.wbsNodes.push(record);
    place(record, parentId, (body['position'] as number | undefined) ?? Number.MAX_SAFE_INTEGER);
    db.save();
    return r.json(wbsNodeView(record), 201, {
      ...etag(record.version),
      Location: `/api/v1/wbs/nodes/${record.id}`,
    });
  }),

  http.patch(`${API}/wbs/nodes/:nodeId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'nodeId', params['nodeId']);
    if (badId) return badId;
    const sent = ifMatchVersion(request, r);
    if (sent instanceof Response) return sent;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    nodeShape(v, body, false, orgCurrency(membership.organizationId));
    if (!v.ok) return v.problem(r);
    const found = visibleNode(r, membership, params['nodeId']);
    if (found instanceof Response) return found;
    const { node, project } = found;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    const stale = checkVersion(r, sent, node.version);
    if (stale) return stale;
    const type = (body['type'] as WbsNodeType | undefined) ?? node.type;
    const domain = new Validator();
    figuresOnDeliverable(domain, body, type);
    if (!domain.ok) return domain.problem(r);
    if (type !== node.type && childrenOf(project.id, node.id).length) {
      return r.problem(409, 'wbs.type_change_not_allowed');
    }

    if (body['name'] !== undefined) node.name = String(body['name']).trim();
    if (body['description'] !== undefined) node.description = String(body['description']);
    if (body['ownerId'] !== undefined) node.ownerId = String(body['ownerId']);
    if (type !== node.type) {
      // A work package that becomes a deliverable drops its own figures; they roll up from now on.
      node.type = type;
      node.plannedEffortHours = 0;
      node.plannedCost = '0';
      node.percentComplete = 0;
    }
    if (body['plannedEffortHours'] !== undefined)
      node.plannedEffortHours = Number(body['plannedEffortHours']);
    if (body['plannedCost'] !== undefined) node.plannedCost = String(body['plannedCost']);
    if (body['percentComplete'] !== undefined)
      node.percentComplete = Number(body['percentComplete']);
    node.version += 1;
    db.save();
    return r.json(wbsNodeView(node), 200, etag(node.version));
  }),

  http.delete(`${API}/wbs/nodes/:nodeId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const cascade = new URL(request.url).searchParams.get('cascade');
    if (cascade !== null && cascade !== 'true' && cascade !== 'false') {
      const v = new Validator();
      v.add('cascade', 'invalid', 'must be true or false');
      return v.problem(r);
    }
    const found = visibleNode(r, membership, params['nodeId']);
    if (found instanceof Response) return found;
    const { node, project } = found;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;
    if (cascade !== 'true' && childrenOf(project.id, node.id).length) {
      return r.problem(409, 'wbs.has_children');
    }
    const doomed = new Set(subtreeIds(node.id));
    db.state.wbsNodes = db.state.wbsNodes.filter((n) => !doomed.has(n.id));
    compactPositions(project.id, node.parentId);
    db.save();
    return r.empty(204);
  }),

  http.post(`${API}/wbs/nodes/:nodeId/move`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'nodeId', params['nodeId']);
    if (badId) return badId;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.uuid('newParentId', body['newParentId']);
    const position = body['position'];
    if (position === undefined) v.add('position', 'required', 'position is required');
    else if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
      v.add('position', 'range', 'must be >= 0', { min: 0 });
    }
    if (!v.ok) return v.problem(r);
    const found = visibleNode(r, membership, params['nodeId']);
    if (found instanceof Response) return found;
    const { node, project } = found;
    const denied = requireEditor(r, project, membership);
    if (denied) return denied;

    const newParentId = body['newParentId'] as string | undefined;
    const parent = newParentId
      ? db.state.wbsNodes.find((n) => n.id === newParentId && n.projectId === project.id)
      : undefined;
    if (newParentId && !parent) return r.problem(404, 'resource.not_found');
    if (newParentId && (newParentId === node.id || isDescendant(newParentId, node.id))) {
      return r.problem(409, 'wbs.cycle');
    }
    if (parent?.type === 'WORK_PACKAGE') return r.problem(409, 'wbs.parent_not_deliverable');
    if (depthOf(newParentId) + subtreeHeight(node.id) > WBS_MAX_DEPTH) {
      return r.problem(409, 'wbs.too_deep');
    }

    const oldParentId = node.parentId;
    place(node, newParentId, position as number);
    if (oldParentId !== newParentId) compactPositions(project.id, oldParentId);
    node.version += 1;
    db.save();
    return r.json(wbsTree(project));
  }),
];
