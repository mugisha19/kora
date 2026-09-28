import { Component, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { HistoryList } from './history-list';

/**
 * "Change history" under an item's details: closed at first (sheets stay short and nothing loads
 * until asked for), a disclosure button opens the list.
 */
@Component({
  selector: 'kora-history-section',
  imports: [HistoryList, MatButton, MatIcon, TranslocoPipe],
  template: `
    <section class="history" [attr.aria-labelledby]="id + '-title'">
      <h3 [id]="id + '-title'">
        <button
          mat-button
          type="button"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="id"
          (click)="open.set(!open())"
        >
          <mat-icon
            [svgIcon]="open() ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
            aria-hidden="true"
          />
          {{ 'history.title' | transloco }}
        </button>
      </h3>
      <div [id]="id">
        @if (open()) {
          <kora-history-list [entityType]="entityType()" [entityId]="entityId()" />
        }
      </div>
    </section>
  `,
  styles: `
    h3 {
      margin: var(--kora-space-3) 0 0;
    }
    h3 button {
      margin-inline-start: calc(-1 * var(--kora-space-3));
      font: var(--mat-sys-title-small);
    }
  `,
})
export class HistorySection {
  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  protected readonly open = signal(false);
  protected readonly id = `history-${crypto.randomUUID()}`;
}
