import { Routes } from '@angular/router';
import { uuidParam } from '../../shared/routing/uuid-matcher';

/** `/portfolios/*` (feature 04), lazy-loaded. Every member can read; the pages hide what they can't do. */
export const PORTFOLIO_ROUTES: Routes = [
  {
    path: '',
    title: 'nav.portfolios',
    loadComponent: () => import('./portfolios-page').then((m) => m.PortfoliosPage),
  },
  {
    matcher: uuidParam('portfolioId'),
    title: 'portfolios.detailTitle',
    loadComponent: () => import('./portfolio-detail-page').then((m) => m.PortfolioDetailPage),
  },
];
