import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/** What each mark on the Gantt means, and (for managers) how to edit by dragging. */
@Component({
  selector: 'kora-gantt-legend',
  imports: [MatIcon, TranslocoPipe],
  template: `
    <ul class="legend">
      <li>
        <span class="swatch normal" aria-hidden="true"></span
        >{{ 'schedule.legend.task' | transloco }}
      </li>
      <li>
        <span class="swatch critical" aria-hidden="true"></span
        >{{ 'schedule.legend.critical' | transloco }}
      </li>
      <li>
        <span class="swatch baseline" aria-hidden="true"></span
        >{{ 'schedule.legend.baseline' | transloco }}
      </li>
      <li>
        <span class="swatch milestone" aria-hidden="true"></span
        >{{ 'schedule.legend.milestone' | transloco }}
      </li>
      <li>
        <span class="swatch off" aria-hidden="true"></span
        >{{ 'schedule.legend.nonWorking' | transloco }}
      </li>
    </ul>
    @if (editable()) {
      <p class="help kora-muted">
        <mat-icon svgIcon="info" aria-hidden="true" />
        {{ 'schedule.dragHelp' | transloco }}
      </p>
    }
  `,
  styles: `
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2) var(--kora-space-4);
      margin: var(--kora-space-3) 0 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);

      li {
        display: flex;
        align-items: center;
        gap: var(--kora-space-1);
      }
    }

    .swatch {
      display: inline-block;
      inline-size: 22px;
      block-size: 10px;
      border-radius: 2px;

      &.normal {
        background: var(--mat-sys-primary);
      }
      &.critical {
        background: repeating-linear-gradient(
          45deg,
          var(--mat-sys-error) 0 3px,
          var(--mat-sys-on-error) 3px 5px
        );
        outline: 1px solid var(--mat-sys-error);
      }
      &.baseline {
        block-size: 4px;
        background: var(--mat-sys-outline);
      }
      &.milestone {
        inline-size: 10px;
        rotate: 45deg;
        background: var(--mat-sys-primary);
      }
      &.off {
        background: var(--mat-sys-surface-container-high);
        outline: 1px solid var(--mat-sys-outline-variant);
      }
    }

    .help {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      margin: var(--kora-space-2) 0 0;
      font: var(--mat-sys-body-small);

      mat-icon {
        inline-size: 18px;
        block-size: 18px;
      }
    }
  `,
})
export class GanttLegend {
  readonly editable = input(false);
}
