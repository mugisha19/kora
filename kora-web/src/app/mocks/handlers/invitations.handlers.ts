import { http } from 'msw';
import {
  INVITATION_SORT_FIELDS,
  INVITATION_STATUSES,
  Invitation,
  ROLES,
  Role,
} from '../../core/api/api.models';
import { InvitationRecord } from '../data';
import { db, must } from '../db';
import {
  API,
  Reply,
  Validator,
  authenticate,
  checkPathId,
  invalidBody,
  latency,
  paging,
  readBody,
  reply,
  requireRole,
  sessionResponse,
  sortAndPage,
  tenant,
} from '../http';

const INVITATION_DAYS = 14;

function toInvitation(record: InvitationRecord): Invitation {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    status: record.status,
    invitedByName: db.user(record.invitedByUserId)?.fullName ?? '',
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

/** A usable invitation for a public token, or the 404/410 the contract specifies. */
function usableInvitation(token: string, r: Reply): InvitationRecord | Response {
  db.expireInvitations();
  const invitation = db.invitationByToken(token);
  if (!invitation) return r.problem(404, 'invitations.not_found');
  switch (invitation.status) {
    case 'EXPIRED':
      return r.problem(410, 'invitations.expired');
    case 'REVOKED':
      return r.problem(410, 'invitations.revoked');
    case 'ACCEPTED':
      return r.problem(410, 'invitations.already_accepted');
    default:
      return invitation;
  }
}

export const invitationsHandlers = [
  http.get(`${API}/invitations`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;

    const url = new URL(request.url);
    const v = new Validator();
    const status = url.searchParams.get('status');
    if (status !== null) v.oneOf('status', status, INVITATION_STATUSES);
    const page = paging(url, INVITATION_SORT_FIELDS, 'createdAt,desc', v);
    if (!v.ok) return v.problem(r);

    db.expireInvitations();
    const invitations = db.state.invitations
      .filter((i) => i.organizationId === membership.organizationId)
      .filter((i) => !status || i.status === status)
      .map(toInvitation);
    return r.json(
      sortAndPage(invitations, page, {
        createdAt: (i) => i.createdAt,
        expiresAt: (i) => i.expiresAt,
        email: (i) => i.email,
      }),
    );
  }),

  http.post(`${API}/invitations`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;

    // Body shape comes before the role check, as in the API.
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    v.email('email', body['email']);
    v.oneOf('role', body['role'], ROLES);
    if (!v.ok) return v.problem(r);

    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;

    const email = String(body['email']).trim();
    const existing = db.userByEmail(email);
    if (existing && db.membership(existing.id, membership.organizationId)) {
      return r.problem(409, 'invitations.already_member', {
        errors: [
          { field: 'email', code: 'invitations.already_member', message: 'already a member' },
        ],
      });
    }
    db.expireInvitations();
    const pending = db.state.invitations.some(
      (i) =>
        i.organizationId === membership.organizationId &&
        i.status === 'PENDING' &&
        i.email.toLowerCase() === email.toLowerCase(),
    );
    if (pending) return r.problem(409, 'invitations.already_pending');

    const now = Date.now();
    const record: InvitationRecord = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      email,
      role: body['role'] as Role,
      status: 'PENDING',
      invitedByUserId: userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + INVITATION_DAYS * 86_400_000).toISOString(),
      token: `invite-${crypto.randomUUID()}`,
    };
    db.state.invitations.push(record);
    db.save();
    // Stands in for the invitation email.
    console.info(`[mock api] Invitation link for ${email}: /invitations/${record.token}`);
    return r.json(toInvitation(record), 201, {
      Location: `/api/v1/invitations/${record.id}`,
    });
  }),

  http.delete(`${API}/invitations/:invitationId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const userId = authenticate(request, r);
    if (userId instanceof Response) return userId;
    const membership = tenant(request, r, userId);
    if (membership instanceof Response) return membership;
    const badId = checkPathId(r, 'invitationId', params['invitationId']);
    if (badId) return badId;
    const denied = requireRole(r, membership.role, ['ORG_ADMIN']);
    if (denied) return denied;

    db.expireInvitations();
    const invitation = db.state.invitations.find(
      (i) => i.id === params['invitationId'] && i.organizationId === membership.organizationId,
    );
    if (!invitation) return r.problem(404, 'resource.not_found');
    if (invitation.status !== 'PENDING') return r.problem(409, 'invitations.not_pending');
    invitation.status = 'REVOKED';
    db.save();
    return r.empty(204);
  }),

  http.get(`${API}/invitations/token/:token`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const invitation = usableInvitation(String(params['token']), r);
    if (invitation instanceof Response) return invitation;
    return r.json({
      organizationName: must(db.organization(invitation.organizationId), 'organization').name,
      email: invitation.email,
      role: invitation.role,
      invitedByName: db.user(invitation.invitedByUserId)?.fullName ?? '',
      expiresAt: invitation.expiresAt,
      existingAccount: db.userByEmail(invitation.email) !== undefined,
    });
  }),

  http.post(`${API}/invitations/token/:token/accept`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const invitation = usableInvitation(String(params['token']), r);
    if (invitation instanceof Response) return invitation;
    const body = await readBody(request);
    if (!body) return invalidBody(r);

    let user = db.userByEmail(invitation.email);
    const v = new Validator();
    if (user) {
      // Existing account: prove it with the current password.
      v.string('password', body['password'], 1, 128);
      if (!v.ok) return v.problem(r);
      if (user.password !== body['password']) return r.problem(401, 'auth.invalid_credentials');
    } else {
      v.string('fullName', body['fullName'], 1, 120);
      v.newPassword('password', body['password']);
      if (!v.ok) return v.problem(r);
      user = {
        id: crypto.randomUUID(),
        email: invitation.email,
        fullName: String(body['fullName']).trim(),
        locale: 'en',
        password: String(body['password']),
      };
      db.state.users.push(user);
    }

    if (!db.membership(user.id, invitation.organizationId)) {
      db.state.memberships.push({
        id: crypto.randomUUID(),
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        joinedAt: new Date().toISOString(),
        version: 1,
      });
    }
    invitation.status = 'ACCEPTED';
    db.save();
    return sessionResponse(r, user.id);
  }),
];
