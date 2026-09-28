import { http } from 'msw';
import { API, authenticate, reply } from '../http';
import { accountHandlers } from './account.handlers';
import { activityHandlers } from './activity.handlers';
import { attachmentHandlers } from './attachment.handlers';
import { authHandlers } from './auth.handlers';
import { charterHandlers } from './charter.handlers';
import { dashboardHandlers } from './dashboard.handlers';
import { invitationsHandlers } from './invitations.handlers';
import { membersHandlers } from './members.handlers';
import { portfolioHandlers } from './portfolio.handlers';
import { projectHandlers } from './project.handlers';
import { reportHandlers } from './report.handlers';
import { scheduleHandlers } from './schedule.handlers';
import { riskHandlers } from './risk.handlers';
import { issueHandlers } from './issue.handlers';
import { stakeholderHandlers } from './stakeholder.handlers';
import { changeRequestHandlers } from './change-request.handlers';
import { resourceHandlers } from './resource.handlers';
import { timesheetHandlers } from './timesheet.handlers';
import { sprintHandlers } from './sprint.handlers';
import { taskHandlers } from './task.handlers';
import { wbsHandlers } from './wbs.handlers';

/**
 * Every mocked operation of contracts 0.1.1 to 0.8.0, then a catch-all like the API's: an unknown path is
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
  ...taskHandlers,
  ...sprintHandlers,
  ...scheduleHandlers,
  ...riskHandlers,
  ...issueHandlers,
  ...stakeholderHandlers,
  ...changeRequestHandlers,
  ...timesheetHandlers,
  ...resourceHandlers,
  ...activityHandlers,
  ...attachmentHandlers,
  ...reportHandlers,
  http.all(`${API}/*`, ({ request }) => {
    const r = reply(request);
    const userId = authenticate(request, r);
    return userId instanceof Response ? userId : r.problem(404, 'resource.not_found');
  }),
];
