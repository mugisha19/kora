import { MatPaginatorIntl } from '@angular/material/paginator';
import { Routes } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { TranslatedPaginatorIntl } from '../../core/i18n/translated-paginator-intl';

/** `/dashboard` (feature 05), lazy-loaded; ECharts is loaded only when a chart is on screen. */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'nav.dashboard',
    providers: [
      provideEchartsCore({ echarts: () => import('./echarts-setup').then((m) => m.echarts) }),
      { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
    ],
    loadComponent: () => import('./dashboard-page').then((m) => m.DashboardPage),
  },
];
