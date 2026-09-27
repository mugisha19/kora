import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ThemeService } from '../../core/theme/theme.service';
import { chartAnimation, themeColor } from '../../shared/charts/theme-colors';
import { StatusTone } from '../../shared/ui/status-chip';

export interface Slice {
  key: string;
  label: string;
  count: number;
  tone: StatusTone;
}

/** A tone's colour in a colour scheme (see `themeColor`). */
function toneColor(tone: StatusTone, scheme: 'light' | 'dark'): string {
  return themeColor(`--kora-${tone}-fg`, scheme);
}

/**
 * A count per category as a chart plus the same numbers as a table. `pie` draws an ECharts donut
 * (decoration for sighted users: hidden from assistive technology, patterned so it doesn't rely on
 * colour; ECharts loads only when the chart scrolls into view). `bar` draws plain CSS bars inside
 * the table rows, which needs no chart library at all. The table is always there: it is the
 * accessible alternative.
 */
@Component({
  selector: 'kora-distribution-chart',
  imports: [NgxEchartsDirective, TranslocoPipe],
  template: `
    <figure>
      <figcaption>{{ heading() }}</figcaption>
      @if (kind() === 'pie' && total() > 0) {
        @defer (on viewport) {
          <div class="chart" echarts [options]="options()" aria-hidden="true"></div>
        } @placeholder {
          <div class="chart" aria-hidden="true"></div>
        }
      }
      <table>
        <caption class="visually-hidden">
          {{
            heading()
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ categoryLabel() }}</th>
            <th scope="col" class="num">{{ 'dashboard.charts.count' | transloco }}</th>
            @if (kind() === 'bar') {
              <td class="bar-col" aria-hidden="true"></td>
            }
          </tr>
        </thead>
        <tbody>
          @for (slice of slices(); track slice.key) {
            <tr>
              <th scope="row">
                <span class="swatch" [class]="'tone-' + slice.tone" aria-hidden="true"></span>
                {{ slice.label }}
              </th>
              <td class="num">{{ slice.count }}</td>
              @if (kind() === 'bar') {
                <td class="bar-col" aria-hidden="true">
                  <progress
                    [class]="'tone-' + slice.tone"
                    [max]="max() || 1"
                    [value]="slice.count"
                  ></progress>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    figcaption {
      margin-block-end: var(--kora-space-2);
      font: var(--mat-sys-title-medium);
    }
    .chart {
      block-size: 220px;
    }
    table {
      inline-size: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th,
    td {
      padding: var(--kora-space-1) var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
      font-weight: normal;
    }
    thead th {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .num {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .bar-col {
      inline-size: 45%;
    }
    progress {
      display: block;
      inline-size: 100%;
      block-size: 12px;
      appearance: none;
      border: 0;
      border-radius: 2px;
      background: transparent;
      color: var(--bar);
    }
    progress::-webkit-progress-bar {
      background: transparent;
    }
    progress::-webkit-progress-value {
      border-radius: 2px;
      background: var(--bar);
    }
    progress::-moz-progress-bar {
      border-radius: 2px;
      background: var(--bar);
    }
    .swatch {
      display: inline-block;
      inline-size: 10px;
      block-size: 10px;
      margin-inline-end: var(--kora-space-1);
      border-radius: 2px;
    }
    /* Bars and swatches: colour plus the category name in the same row, never colour alone. */
    .tone-success {
      --bar: var(--kora-success-fg);
    }
    .tone-warning {
      --bar: var(--kora-warning-fg);
    }
    .tone-danger {
      --bar: var(--kora-danger-fg);
    }
    .tone-info {
      --bar: var(--kora-info-fg);
    }
    .tone-neutral {
      --bar: var(--kora-neutral-fg);
    }
    .swatch {
      background: var(--bar);
    }
  `,
})
export class DistributionChart {
  readonly heading = input.required<string>();
  readonly categoryLabel = input.required<string>();
  readonly slices = input.required<readonly Slice[]>();
  readonly kind = input<'pie' | 'bar'>('pie');

  private readonly theme = inject(ThemeService);
  protected readonly total = computed(() => this.slices().reduce((t, s) => t + s.count, 0));
  protected readonly max = computed(() => Math.max(0, ...this.slices().map((s) => s.count)));

  protected readonly options = computed<EChartsCoreOption>(() => {
    const scheme = this.theme.scheme();
    const slices = this.slices().filter((s) => s.count > 0);
    const text = toneColor('neutral', scheme);
    const data = slices.map((s) => ({
      name: s.label,
      value: s.count,
      itemStyle: { color: toneColor(s.tone, scheme) },
    }));
    const base = {
      aria: { enabled: true, decal: { show: true } },
      textStyle: { color: text },
      animation: chartAnimation(),
    };
    return {
      ...base,
      series: [
        {
          type: 'pie',
          radius: ['45%', '75%'],
          label: { formatter: '{b}: {c}', color: text },
          data,
        },
      ],
    };
  });
}
