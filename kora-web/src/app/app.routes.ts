import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

/**
 * Route `title`s are translation keys (see TranslatedTitleStrategy). Pages are lazy-loaded.
 * Two lazy-loaded layouts (keeping the initial bundle small): public pages in the auth layout, the signed-in app in the shell. Both top-level
 * routes have an empty path; the router picks the one whose children match the URL.
 */
export const routes: Routes = [
  // Must come first: an empty-path layout route would otherwise match `/` with no child page.
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: '',
    loadComponent: () => import('./core/layout/auth-layout').then((m) => m.AuthLayout),
    // canActivateChild too: moving between sign-in pages keeps the layout, so its canActivate won't re-run.
    canActivate: [guestGuard],
    canActivateChild: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'auth.login.title',
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'auth.register.title',
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        title: 'auth.forgot.title',
        loadComponent: () =>
          import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
      },
      {
        path: 'reset-password',
        title: 'auth.reset.title',
        loadComponent: () =>
          import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
      },
    ],
  },
  {
    // Invitation links work whether or not someone is signed in (feature 03).
    path: 'invitations/:token',
    loadComponent: () => import('./core/layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: '',
        title: 'invitation.pageTitle',
        loadComponent: () =>
          import('./features/invitations/accept-invitation-page').then(
            (m) => m.AcceptInvitationPage,
          ),
      },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'portfolios',
        loadChildren: () =>
          import('./features/portfolios/portfolios.routes').then((m) => m.PORTFOLIO_ROUTES),
      },
      {
        path: 'projects',
        loadChildren: () =>
          import('./features/projects/projects.routes').then((m) => m.PROJECT_ROUTES),
      },
      {
        path: 'timesheets',
        loadChildren: () =>
          import('./features/timesheets/timesheets.routes').then((m) => m.TIMESHEET_ROUTES),
      },
      {
        path: 'resources',
        title: 'nav.resources',
        loadComponent: () =>
          import('./features/resources/resources-page').then((m) => m.ResourcesPage),
      },
      {
        path: 'reports',
        title: 'reports.title',
        loadComponent: () => import('./features/reports/reports-page').then((m) => m.ReportsPage),
      },
      {
        path: 'approvals',
        title: 'approvals.title',
        loadComponent: () =>
          import('./features/approvals/approvals-page').then((m) => m.ApprovalsPage),
      },
      {
        path: 'admin',
        canActivate: [roleGuard('ORG_ADMIN')],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
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
