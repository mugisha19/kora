import { MatPaginatorIntl } from '@angular/material/paginator';
import { Routes } from '@angular/router';
import { TranslatedPaginatorIntl } from '../../core/i18n/translated-paginator-intl';
import { AdminLayout } from './admin-layout';

/** `/admin/*`, lazy-loaded behind `roleGuard('ORG_ADMIN')` (see app.routes.ts). */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayout,
    // Provided here, not at the root: importing the paginator would pull its select and form
    // field into the initial bundle, and only the admin lists page through results.
    providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'members' },
      {
        path: 'members',
        title: 'admin.tabs.members',
        loadComponent: () => import('./members/members-page').then((m) => m.MembersPage),
      },
      {
        path: 'invitations',
        title: 'admin.tabs.invitations',
        loadComponent: () =>
          import('./invitations/invitations-page').then((m) => m.InvitationsPage),
      },
      {
        path: 'organization',
        title: 'admin.tabs.organization',
        loadComponent: () =>
          import('./organization/organization-page').then((m) => m.OrganizationPage),
      },
      {
        path: 'calendar',
        title: 'admin.tabs.calendar',
        loadComponent: () => import('./calendar/calendar-page').then((m) => m.CalendarPage),
      },
    ],
  },
];
