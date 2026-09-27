import { http } from 'msw';
import { API, authenticate, reply } from '../http';
import { accountHandlers } from './account.handlers';
import { authHandlers } from './auth.handlers';
import { charterHandlers } from './charter.handlers';
import { dashboardHandlers } from './dashboard.handlers';
import { invitationsHandlers } from './invitations.handlers';
import { membersHandlers } from './members.handlers';
import { portfolioHandlers } from './portfolio.handlers';
import { projectHandlers } from './project.handlers';
import { wbsHandlers } from './wbs.handlers';

/**
 * Every mocked operation of contracts 0.1.1 and 0.2.0, then a catch-all like the API's: an unknown path is
 * 401 without a valid token (security runs first) and 404 with one.
 */
export const handlers = [
  ...authHandlers,
  ...accountHandlers,
  ...membersHandlers,
  ...invitationsHandlers,
  ...portfolioHandlers,
  ...projectHandlers,
  ...charterHandlers,
  ...wbsHandlers,
  ...dashboardHandlers,
  http.all(`${API}/*`, ({ request }) => {
    const r = reply(request);
    const userId = authenticate(request, r);
    return userId instanceof Response ? userId : r.problem(404, 'resource.not_found');
  }),
];
