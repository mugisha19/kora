import { Component, computed, input } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { Health, ProjectStatus } from '../../core/api/api.models';
import { StatusChip, StatusTone } from './status-chip';

/** RAG health → tone and a distinct icon shape, so the chip reads without colour (feature 05). */
export const HEALTH_LOOK: Record<Health, { tone: StatusTone; icon: string }> = {
  GREEN: { tone: 'success', icon: 'check_circle' },
  AMBER: { tone: 'warning', icon: 'warning' },
  RED: { tone: 'danger', icon: 'error' },
  GREY: { tone: 'neutral', icon: 'schedule' },
};

/**
 * A project's health. An override by the manager is marked "overridden" in text (not only an
 * icon), and the reason is available as a tooltip and to screen readers.
 */
@Component({
  selector: 'kora-health-chip',
  imports: [MatTooltip, StatusChip, TranslocoPipe],
  template: `
    <kora-status-chip
      [tone]="look().tone"
      [icon]="look().icon"
      [label]="
        overridden()
          ? ('health.overriddenLabel' | transloco: { health: ('health.' + health() | transloco) })
          : ('health.' + health() | transloco)
      "
      [matTooltip]="reason() ?? ''"
      [matTooltipDisabled]="!reason()"
    />
    @if (reason() && showReason()) {
      <span class="reason">{{ reason() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kora-space-2);
    }
    .reason {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class HealthChip {
  readonly health = input.required<Health>();
  readonly overridden = input(false);
  readonly reason = input<string>();
  /** Show the reason as text next to the chip (detail pages); tables use the tooltip. */
  readonly showReason = input(false);

  protected readonly look = computed(() => HEALTH_LOOK[this.health()]);
}

/** Tone and icon per lifecycle status. */
export const PROJECT_STATUS_LOOK: Record<ProjectStatus, { tone: StatusTone; icon: string }> = {
  PROPOSED: { tone: 'neutral', icon: 'schedule' },
  APPROVED: { tone: 'info', icon: 'check' },
  IN_PROGRESS: { tone: 'info', icon: 'refresh' },
  ON_HOLD: { tone: 'warning', icon: 'block' },
  CLOSING: { tone: 'info', icon: 'logout' },
  CLOSED: { tone: 'success', icon: 'check_circle' },
  CANCELLED: { tone: 'neutral', icon: 'cancel' },
};

@Component({
  selector: 'kora-project-status-chip',
  imports: [StatusChip, TranslocoPipe],
  template: `
    <kora-status-chip
      [tone]="look().tone"
      [icon]="look().icon"
      [label]="'projectStatus.' + status() | transloco"
    />
  `,
})
export class ProjectStatusChip {
  readonly status = input.required<ProjectStatus>();
  protected readonly look = computed(() => PROJECT_STATUS_LOOK[this.status()]);
}
