import { http } from 'msw';
import { API, authenticate, reply } from '../http';
import { accountHandlers } from './account.handlers';
import { authHandlers } from './auth.handlers';
import { invitationsHandlers } from './invitations.handlers';
import { membersHandlers } from './members.handlers';

/**
 * Every mocked operation of contract 0.1.1, then a catch-all like the API's: an unknown path is
 * 401 without a valid token (security runs first) and 404 with one.
 */
export const handlers = [
  ...authHandlers,
  ...accountHandlers,
  ...membersHandlers,
  ...invitationsHandlers,
  http.all(`${API}/*`, ({ request }) => {
    const r = reply(request);
    const userId = authenticate(request, r);
    return userId instanceof Response ? userId : r.problem(404, 'resource.not_found');
  }),
];
