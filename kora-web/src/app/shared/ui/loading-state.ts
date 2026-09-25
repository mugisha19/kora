import { Component, input } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';

/** Busy placeholder; `role="status"` announces the label politely without stealing focus. */
@Component({
  selector: 'kora-loading-state',
  imports: [MatProgressSpinner, TranslocoPipe],
  template: `
    <mat-progress-spinner mode="indeterminate" diameter="40" aria-hidden="true" />
    <span>{{ label() ?? ('common.loading' | transloco) }}</span>
  `,
  host: { role: 'status' },
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--kora-space-3);
      padding: var(--kora-space-8) var(--kora-space-4);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LoadingState {
  readonly label = input<string>();
}
