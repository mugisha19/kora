import { Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * A failed load. `role="alert"` makes screen readers announce it; the correlation id lets support
 * find the server log line for this exact failure.
 */
@Component({
  selector: 'kora-error-state',
  imports: [MatButton, MatIcon, TranslocoPipe],
  template: `
    <mat-icon class="icon" svgIcon="error" aria-hidden="true" />
    <h2>{{ heading() ?? ('common.errorTitle' | transloco) }}</h2>
    <p>{{ message() ?? ('common.errorMessage' | transloco) }}</p>
    @if (correlationId()) {
      <p class="reference">Ref. {{ correlationId() }}</p>
    }
    <button mat-flat-button type="button" (click)="retry.emit()">
      <mat-icon svgIcon="refresh" aria-hidden="true" />
      {{ 'common.retry' | transloco }}
    </button>
  `,
  host: { role: 'alert' },
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--kora-space-2);
      padding: var(--kora-space-8) var(--kora-space-4);
      text-align: center;
      border-radius: var(--kora-radius);
      background: var(--kora-danger-bg);
      color: var(--kora-danger-fg);
    }
    .icon {
      inline-size: 40px;
      block-size: 40px;
    }
    h2 {
      font: var(--mat-sys-title-large);
    }
    p {
      max-inline-size: 60ch;
      margin: 0;
    }
    .reference {
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ErrorState {
  readonly heading = input<string>();
  readonly message = input<string>();
  readonly correlationId = input<string>();
  readonly retry = output();
}
