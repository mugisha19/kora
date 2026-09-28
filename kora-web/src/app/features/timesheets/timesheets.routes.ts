import { Routes, UrlSegment } from '@angular/router';

/** `/timesheets/2026-W40`: an ISO week (the notification links use this form). */
function weekMatcher(segments: UrlSegment[]) {
  const [week] = segments;
  return segments.length === 1 && /^\d{4}-W\d{2}$/.test(week.path)
    ? { consumed: segments, posParams: { week } }
    : null;
}

/** `/timesheets` (feature 15), lazy-loaded. */
export const TIMESHEET_ROUTES: Routes = [
  {
    path: '',
    title: 'nav.timesheets',
    loadComponent: () => import('./timesheet-page').then((m) => m.TimesheetPage),
  },
  {
    matcher: weekMatcher,
    title: 'nav.timesheets',
    loadComponent: () => import('./timesheet-page').then((m) => m.TimesheetPage),
  },
];
