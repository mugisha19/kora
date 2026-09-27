import { inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { CanMatchFn, Routes } from '@angular/router';
import { canCreateProject } from '../../core/auth/permissions';
import { TranslatedPaginatorIntl } from '../../core/i18n/translated-paginator-intl';
import { SessionStore } from '../../core/session/session.store';
import { uuidParam } from '../../shared/routing/uuid-matcher';

/** `/projects/new` only for roles that can create projects; others fall through to "not found". */
const canCreate: CanMatchFn = () => canCreateProject(inject(SessionStore).activeRole());

const comingSoon = (tab: 'board' | 'backlog' | 'schedule') => ({
  path: tab,
  title: `workspace.tabs.${tab}`,
  data: { tab },
  loadComponent: () => import('./workspace/coming-soon-tab').then((m) => m.ComingSoonTab),
});

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
          comingSoon('board'),
          comingSoon('backlog'),
          comingSoon('schedule'),
        ],
      },
    ],
  },
];
