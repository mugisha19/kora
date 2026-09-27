import { http } from 'msw';
import { DASHBOARD_SORT_FIELDS, HEALTHS } from '../../core/api/api.models';
import { API, Validator, latency, paging, reply, sortAndPage } from '../http';
import {
  dashboardRow,
  dashboardSummary,
  orgToday,
  severity,
  visibleProjects,
} from '../projects-domain';
import { caller } from './portfolio.handlers';

export const dashboardHandlers = [
  http.get(`${API}/dashboard/summary`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const portfolioId = new URL(request.url).searchParams.get('portfolioId');
    const v = new Validator();
    v.uuid('portfolioId', portfolioId ?? undefined);
    if (!v.ok) return v.problem(r);
    const projects = visibleProjects(membership).filter(
      (p) => !portfolioId || p.portfolioId === portfolioId,
    );
    return r.json(dashboardSummary(projects, membership.organizationId));
  }),

  http.get(`${API}/dashboard/projects`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const portfolioId = url.searchParams.get('portfolioId');
    const health = url.searchParams.get('health');
    const v = new Validator();
    v.uuid('portfolioId', portfolioId ?? undefined);
    if (health !== null) v.oneOf('health', health, HEALTHS);
    const page = paging(url, DASHBOARD_SORT_FIELDS, 'name,asc', v);
    if (!v.ok) return v.problem(r);
    // Without an explicit sort the worst projects come first.
    if (!url.searchParams.has('sort')) {
      page.sort = [
        { field: 'severity', direction: 1 },
        { field: 'name', direction: 1 },
      ];
    }

    const today = orgToday(membership.organizationId);
    const rows = visibleProjects(membership)
      .filter((p) => !portfolioId || p.portfolioId === portfolioId)
      .map((p) => dashboardRow(p, today))
      .filter((row) => !health || row.health === health);
    return r.json(
      sortAndPage(rows, page, {
        severity: (row) => severity(row.health),
        code: (row) => row.code,
        name: (row) => row.name,
        percentComplete: (row) => row.percentComplete,
        targetEndDate: (row) => row.targetEndDate ?? '',
      }),
    );
  }),
];
