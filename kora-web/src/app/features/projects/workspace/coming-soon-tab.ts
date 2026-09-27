import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { EmptyState } from '../../../shared/ui/empty-state';

/** Board, backlog and schedule arrive in later phases (features 08–10); the tab says so. */
@Component({
  selector: 'kora-coming-soon-tab',
  imports: [EmptyState, TranslocoPipe],
  template: `
    <kora-empty-state
      icon="schedule"
      [heading]="'workspace.comingSoon.' + tab() + '.title' | transloco"
      [message]="'workspace.comingSoon.' + tab() + '.message' | transloco"
    />
  `,
})
export class ComingSoonTab {
  /** Route data. */
  readonly tab = input.required<'board' | 'backlog' | 'schedule'>();
}
