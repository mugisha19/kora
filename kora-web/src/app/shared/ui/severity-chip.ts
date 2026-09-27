import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Severity } from '../../core/api/api.models';
import { StatusChip, StatusTone } from './status-chip';

/** Risk severity bands (feature 11): a tone and an arrow shape per band, with the word. */
export const SEVERITY_LOOK: Record<Severity, { tone: StatusTone; icon: string }> = {
  CRITICAL: { tone: 'danger', icon: 'keyboard_double_arrow_up' },
  HIGH: { tone: 'warning', icon: 'keyboard_arrow_up' },
  MEDIUM: { tone: 'info', icon: 'drag_handle' },
  LOW: { tone: 'success', icon: 'keyboard_arrow_down' },
};

/** "Critical · 16": the band as a chip, with the score when given. */
@Component({
  selector: 'kora-severity-chip',
  imports: [StatusChip, TranslocoPipe],
  template: `
    <kora-status-chip
      [tone]="look().tone"
      [icon]="look().icon"
      [label]="
        ('severity.' + severity() | transloco) + (score() !== undefined ? ' · ' + score() : '')
      "
    />
  `,
})
export class SeverityChip {
  readonly severity = input.required<Severity>();
  readonly score = input<number>();
  protected readonly look = computed(() => SEVERITY_LOOK[this.severity()]);
}
