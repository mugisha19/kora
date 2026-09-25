import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/** Shown when a list or page has nothing yet; optional call to action in the default slot. */
@Component({
  selector: 'kora-empty-state',
  imports: [MatIcon],
  template: `
    <mat-icon class="icon" [svgIcon]="icon()" aria-hidden="true" />
    <h2>{{ heading() }}</h2>
    @if (message()) {
      <p>{{ message() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--kora-space-2);
      padding: var(--kora-space-8) var(--kora-space-4);
      text-align: center;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
    }
    .icon {
      inline-size: 48px;
      block-size: 48px;
      color: var(--mat-sys-on-surface-variant);
    }
    h2 {
      font: var(--mat-sys-title-large);
    }
    p {
      max-inline-size: 60ch;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly message = input<string>();
  readonly icon = input('folder_open');
}
