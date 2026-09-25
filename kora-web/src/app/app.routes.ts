import { Routes } from '@angular/router';
import { Shell } from './core/layout/shell';

/** Route `title`s are translation keys (see TranslatedTitleStrategy). Pages are lazy-loaded. */
export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'nav.dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'settings',
        title: 'nav.settings',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
      {
        path: '**',
        title: 'notFound.title',
        loadComponent: () =>
          import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
