import { inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { CanMatchFn, Routes } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { canCreateProject } from '../../core/auth/permissions';
import { TranslatedPaginatorIntl } from '../../core/i18n/translated-paginator-intl';
import { SessionStore } from '../../core/session/session.store';
import { uuidParam } from '../../shared/routing/uuid-matcher';

/** `/projects/new` only for roles that can create projects; others fall through to "not found". */
const canCreate: CanMatchFn = () => canCreateProject(inject(SessionStore).activeRole());

/** `/projects/*` (features 04, 06, 07), lazy-loaded. */
export const PROJECT_ROUTES: Routes = [
  {
    path: '',
    providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
    children: [
      {
        path: '',
        title: 'nav.projects',
        loadComponent: () => import('./projects-page').then((m) => m.ProjectsPage),
      },
      {
        path: 'new',
        title: 'projects.createTitle',
        canMatch: [canCreate],
        loadComponent: () => import('./project-form-page').then((m) => m.ProjectFormPage),
      },
      {
        matcher: uuidParam('projectId', 'edit'),
        title: 'projects.editTitle',
        loadComponent: () => import('./project-form-page').then((m) => m.ProjectFormPage),
      },
      {
        matcher: uuidParam('projectId'),
        title: 'projects.workspaceTitle',
        loadComponent: () =>
          import('./workspace/project-workspace').then((m) => m.ProjectWorkspace),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            title: 'workspace.tabs.overview',
            loadComponent: () =>
              import('./workspace/overview/project-overview').then((m) => m.ProjectOverview),
          },
          {
            path: 'charter',
            title: 'workspace.tabs.charter',
            loadComponent: () =>
              import('./workspace/charter/charter-tab').then((m) => m.CharterTab),
          },
          {
            path: 'wbs',
            title: 'workspace.tabs.wbs',
            loadComponent: () => import('./workspace/wbs/wbs-tab').then((m) => m.WbsTab),
          },
          {
            path: 'board',
            title: 'workspace.tabs.board',
            loadComponent: () => import('./workspace/board/board-tab').then((m) => m.BoardTab),
            // A task opens in its sheet over the board: /board/<taskId>.
            children: [
              { path: '', children: [] },
              {
                matcher: uuidParam('taskId'),
                loadComponent: () =>
                  import('./workspace/work/task-routes').then((m) => m.TaskSheetRoute),
              },
            ],
          },
          {
            path: 'backlog',
            title: 'workspace.tabs.backlog',
            // Burndown and velocity charts: ECharts loads only when a chart is on screen.
            providers: [
              provideEchartsCore({
                echarts: () => import('./workspace/backlog/echarts-sprint').then((m) => m.echarts),
              }),
            ],
            loadComponent: () =>
              import('./workspace/backlog/backlog-tab').then((m) => m.BacklogTab),
          },
          {
            path: 'schedule',
            title: 'workspace.tabs.schedule',
            loadComponent: () =>
              import('./workspace/schedule/schedule-tab').then((m) => m.ScheduleTab),
            // A task opens in its sheet over the schedule: /schedule/<taskId>.
            children: [
              { path: '', children: [] },
              {
                matcher: uuidParam('taskId'),
                loadComponent: () =>
                  import('./workspace/work/task-routes').then((m) => m.TaskSheetRoute),
              },
            ],
          },
          {
            path: 'risks',
            title: 'workspace.tabs.risks',
            loadComponent: () => import('./workspace/risks/risks-tab').then((m) => m.RisksTab),
            // A risk opens in a side sheet over the register: /risks/<id> (notification links).
            children: [
              { path: '', children: [] },
              {
                matcher: uuidParam('riskId'),
                loadComponent: () =>
                  import('./workspace/risks/risk-sheet').then((m) => m.RiskSheetRoute),
              },
            ],
          },
          {
            path: 'issues',
            title: 'workspace.tabs.issues',
            loadComponent: () => import('./workspace/issues/issues-tab').then((m) => m.IssuesTab),
            children: [
              { path: '', children: [] },
              {
                matcher: uuidParam('issueId'),
                loadComponent: () =>
                  import('./workspace/issues/issue-sheet').then((m) => m.IssueSheetRoute),
              },
            ],
          },
          {
            path: 'stakeholders',
            title: 'workspace.tabs.stakeholders',
            loadComponent: () =>
              import('./workspace/stakeholders/stakeholders-tab').then((m) => m.StakeholdersTab),
          },
          {
            path: 'change-requests',
            title: 'workspace.tabs.change-requests',
            loadComponent: () =>
              import('./workspace/changes/changes-tab').then((m) => m.ChangesTab),
          },
          {
            path: 'time',
            title: 'workspace.tabs.time',
            loadComponent: () => import('./workspace/time/time-tab').then((m) => m.TimeTab),
          },
          {
            path: 'evm',
            title: 'workspace.tabs.evm',
            // The S-curve: ECharts loads only when the chart is on screen.
            providers: [
              provideEchartsCore({
                echarts: () => import('./workspace/backlog/echarts-sprint').then((m) => m.echarts),
              }),
            ],
            loadComponent: () => import('./workspace/evm/evm-tab').then((m) => m.EvmTab),
          },
          {
            path: 'activity',
            title: 'workspace.tabs.activity',
            loadComponent: () =>
              import('./workspace/activity/activity-tab').then((m) => m.ActivityTab),
          },
          {
            // Notification and activity links: /tasks/<taskId> opens it over the board or schedule.
            path: 'tasks',
            children: [
              {
                matcher: uuidParam('taskId'),
                loadComponent: () =>
                  import('./workspace/work/task-routes').then((m) => m.TaskLinkRoute),
              },
            ],
          },
          {
            path: 'change-requests',
            children: [
              {
                matcher: uuidParam('changeRequestId'),
                title: 'changes.detailTitle',
                loadComponent: () =>
                  import('./workspace/changes/change-request-page').then(
                    (m) => m.ChangeRequestPage,
                  ),
              },
            ],
          },
        ],
      },
    ],
  },
];
