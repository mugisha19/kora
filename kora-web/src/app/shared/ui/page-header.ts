import { Component, input } from '@angular/core';

/**
 * Page title row. The `<h1>` is focusable (tabindex -1) so the shell can move focus to it after a
 * route change, telling screen-reader users where they landed. Actions go in the default slot.
 */
@Component({
  selector: 'kora-page-header',
  template: `
    <div class="text">
      <h1 tabindex="-1">{{ heading() }}</h1>
      @if (subtitle()) {
        <p class="subtitle">{{ subtitle() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--kora-space-4);
      margin-block-end: var(--kora-space-6);
    }
    h1 {
      font: var(--mat-sys-headline-medium);
    }
    .subtitle {
      margin: var(--kora-space-1) 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();
  readonly subtitle = input<string>();
}
