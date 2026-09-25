import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const DEFAULT_ICONS: Record<StatusTone, string> = {
  success: 'check_circle',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  neutral: 'schedule',
};

/**
 * Status/health label (RAG, severity, lifecycle). Colour is never the only signal: every tone has
 * a distinct icon shape and the text label, so it reads the same in greyscale or to a screen reader.
 */
@Component({
  selector: 'kora-status-chip',
  imports: [MatIcon],
  template: `
    <mat-icon [svgIcon]="iconName()" aria-hidden="true" />
    <span>{{ label() }}</span>
  `,
  host: { '[class]': '"tone-" + tone()' },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--kora-space-1);
      padding: 2px var(--kora-space-2) 2px var(--kora-space-1);
      border-radius: 999px;
      font: var(--mat-sys-label-large);
      white-space: nowrap;
    }
    mat-icon {
      inline-size: 18px;
      block-size: 18px;
    }
    :host(.tone-success) {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
    :host(.tone-warning) {
      color: var(--kora-warning-fg);
      background: var(--kora-warning-bg);
    }
    :host(.tone-danger) {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
    }
    :host(.tone-info) {
      color: var(--kora-info-fg);
      background: var(--kora-info-bg);
    }
    :host(.tone-neutral) {
      color: var(--kora-neutral-fg);
      background: var(--kora-neutral-bg);
    }
  `,
})
export class StatusChip {
  readonly tone = input<StatusTone>('neutral');
  readonly label = input.required<string>();
  readonly icon = input<string>();

  protected readonly iconName = computed(() => this.icon() ?? DEFAULT_ICONS[this.tone()]);
}
