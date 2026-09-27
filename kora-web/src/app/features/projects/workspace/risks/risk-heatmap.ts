import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RiskHeatmapCell } from '../../../../core/api/api.models';

/** "4-3": a cell's probability and impact, as the register's `cell` query parameter. */
export const cellId = (cell: Pick<RiskHeatmapCell, 'probability' | 'impact'>) =>
  `${cell.probability}-${cell.impact}`;

/**
 * The 5 × 5 probability × impact grid of open risks (feature 11). A table: rows are probability
 * (5 at the top), columns impact; every cell says its count and severity band in words, so it
 * reads without colour. Choosing a cell filters the register to it; choosing it again clears.
 */
@Component({
  selector: 'kora-risk-heatmap',
  imports: [TranslocoPipe],
  template: `
    <table>
      <caption>
        {{
          'risks.heatmap.caption' | transloco
        }}
      </caption>
      <thead>
        <tr>
          <td class="corner">
            <span class="axis">{{ 'risks.fields.probability' | transloco }} ↓</span>
            <span class="axis">{{ 'risks.fields.impact' | transloco }} →</span>
          </td>
          @for (impact of levels; track impact) {
            <th scope="col">
              <span class="level">{{ impact }}</span>
              <span class="name">{{ 'riskImpactShort.' + impact | transloco }}</span>
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.probability) {
          <tr>
            <th scope="row">
              <span class="level">{{ row.probability }}</span>
              <span class="name">{{ 'riskProbabilityShort.' + row.probability | transloco }}</span>
            </th>
            @for (cell of row.cells; track cell.impact) {
              <td [class]="'band band-' + cell.severity.toLowerCase()">
                @if (cell.count) {
                  <button
                    type="button"
                    [attr.aria-pressed]="selected() === id(cell)"
                    [attr.aria-label]="
                      'risks.heatmap.cell'
                        | transloco
                          : {
                              probability: cell.probability,
                              impact: cell.impact,
                              count: cell.count,
                              severity: 'severity.' + cell.severity | transloco,
                            }
                    "
                    (click)="picked.emit(selected() === id(cell) ? null : id(cell))"
                  >
                    <span class="count">{{ cell.count }}</span>
                    <span class="word">{{ 'severity.' + cell.severity | transloco }}</span>
                  </button>
                } @else {
                  <span class="score" aria-hidden="true">{{ cell.score }}</span>
                  <span class="visually-hidden">{{ 'risks.heatmap.none' | transloco }}</span>
                }
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
      overflow-x: auto;
    }
    table {
      border-collapse: separate;
      border-spacing: 3px;
      font: var(--mat-sys-body-small);
    }
    caption {
      margin-block-end: var(--kora-space-2);
      text-align: start;
      font: var(--mat-sys-title-small);
    }
    th {
      padding: var(--kora-space-1);
      font-weight: normal;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    th[scope='row'] {
      text-align: end;
      white-space: nowrap;
    }
    .level {
      display: block;
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface);
    }
    th[scope='row'] .level {
      display: inline;
      margin-inline-end: var(--kora-space-1);
    }
    .corner {
      vertical-align: bottom;
    }
    .axis {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
    }
    .band {
      inline-size: 64px;
      block-size: 48px;
      padding: 0;
      border-radius: 6px;
      text-align: center;
    }
    .band-low {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
    .band-medium {
      color: var(--kora-info-fg);
      background: var(--kora-info-bg);
    }
    .band-high {
      color: var(--kora-warning-fg);
      background: var(--kora-warning-bg);
    }
    .band-critical {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
    }
    button {
      display: grid;
      place-content: center;
      inline-size: 100%;
      block-size: 100%;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 6px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      border-color: currentColor;
    }
    button:focus-visible {
      outline: 3px solid var(--mat-sys-primary);
      outline-offset: 1px;
    }
    button[aria-pressed='true'] {
      border-color: currentColor;
      box-shadow: inset 0 0 0 2px currentColor;
    }
    .count {
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }
    .word {
      font: var(--mat-sys-label-small);
    }
    @media (max-width: 599px) {
      .name {
        display: none;
      }
      .band {
        inline-size: 48px;
      }
    }
  `,
})
export class RiskHeatmap {
  readonly cells = input.required<readonly RiskHeatmapCell[]>();
  /** The chosen cell (`cellId`), if any. */
  readonly selected = input<string | null>(null);
  readonly picked = output<string | null>();

  protected readonly levels = [1, 2, 3, 4, 5];
  protected readonly id = cellId;
  /** The API sends probability 5 → 1, impact 1 → 5 within a row. */
  protected readonly rows = computed(() =>
    [5, 4, 3, 2, 1].map((probability) => ({
      probability,
      cells: this.cells()
        .filter((c) => c.probability === probability)
        .sort((a, b) => a.impact - b.impact),
    })),
  );
}
