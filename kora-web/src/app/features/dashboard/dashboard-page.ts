import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

/** Landing page. The portfolio dashboard itself (KPIs, charts, "needs attention") is Phase 4. */
@Component({
  selector: 'kora-dashboard-page',
  imports: [EmptyState, PageHeader, TranslocoPipe],
  template: `
    <kora-page-header
      [heading]="'dashboard.title' | transloco"
      [subtitle]="'dashboard.subtitle' | transloco"
    />
    <kora-empty-state
      icon="dashboard"
      [heading]="'dashboard.emptyTitle' | transloco"
      [message]="'dashboard.emptyMessage' | transloco"
    />
  `,
})
export class DashboardPage {}
