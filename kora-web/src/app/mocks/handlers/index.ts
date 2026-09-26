import { http } from 'msw';
import { API, reply } from '../http';
import { accountHandlers } from './account.handlers';
import { authHandlers } from './auth.handlers';
import { invitationsHandlers } from './invitations.handlers';
import { membersHandlers } from './members.handlers';

/** Every mocked operation of contract 0.1.0, then a catch-all 404 like the API's. */
export const handlers = [
  ...authHandlers,
  ...accountHandlers,
  ...membersHandlers,
  ...invitationsHandlers,
  http.all(`${API}/*`, ({ request }) => reply(request).problem(404, 'resource.not_found')),
];
