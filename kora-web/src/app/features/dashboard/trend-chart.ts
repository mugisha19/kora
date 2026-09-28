import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { DashboardTrendMonth } from '../../core/api/api.models';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { chartAnimation, themeColor } from '../../shared/charts/theme-colors';
import { formatMoney } from '../../shared/format/money';

/**
 * The portfolio's SPI and CPI per month (feature 05 with feature 17), with the health rule's
 * thresholds (0.80 and 0.95) as lines. SPI and CPI differ by dash and marker, not only colour; the
 * table has the figures, PV, EV and AC included.
 */
@Component({
  selector: 'kora-trend-chart',
  imports: [NgxEchartsDirective, TranslocoPipe],
  template: `
    <figure>
      <figcaption>{{ 'dashboard.trends.title' | transloco }}</figcaption>
      @defer (on viewport) {
        <div class="chart" echarts [options]="options()" aria-hidden="true"></div>
      } @placeholder {
        <div class="chart" aria-hidden="true"></div>
      }
      <details>
        <summary>{{ 'charts.showData' | transloco }}</summary>
        <div
          class="wrap"
          role="region"
          tabindex="0"
          [attr.aria-label]="'dashboard.trends.title' | transloco"
        >
          <table>
            <caption class="visually-hidden">
              {{
                'dashboard.trends.title' | transloco
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ 'dashboard.trends.month' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.pv.short' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.ev.short' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.ac.short' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.spi.short' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.cpi.short' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (m of months(); track m.month) {
                <tr>
                  <th scope="row">{{ monthName(m.month) }}</th>
                  <td>{{ money(m.pv) }}</td>
                  <td>{{ money(m.ev) }}</td>
                  <td>{{ money(m.ac) }}</td>
                  <td>{{ m.spi !== undefined ? m.spi.toFixed(2) : '—' }}</td>
                  <td>{{ m.cpi !== undefined ? m.cpi.toFixed(2) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    figcaption {
      margin-block-end: var(--kora-space-2);
      font: var(--mat-sys-title-small);
    }
    .chart {
      block-size: 240px;
    }
    summary {
      cursor: pointer;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-label-large);
    }
    .wrap {
      overflow-x: auto;
    }
    .wrap:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
    }
    table {
      inline-size: 100%;
      margin-block-start: var(--kora-space-2);
      border-collapse: collapse;
      font: var(--mat-sys-body-small);
    }
    th,
    td {
      padding: var(--kora-space-1) var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: end;
      white-space: nowrap;
    }
    th:first-child {
      text-align: start;
    }
  `,
})
export class TrendChart {
  readonly months = input.required<readonly DashboardTrendMonth[]>();

  private readonly theme = inject(ThemeService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$);

  protected monthName(month: string): string {
    return new Intl.DateTimeFormat(this.language.current(), {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01`));
  }

  protected money(value: DashboardTrendMonth['pv']): string {
    return formatMoney(value, this.language.current());
  }

  protected readonly options = computed<EChartsCoreOption>(() => {
    this.lang();
    const scheme = this.theme.scheme();
    const color = (token: string) => themeColor(token, scheme);
    const text = color('--mat-sys-on-surface-variant');
    const t = (key: string) => this.transloco.translate(key);
    const months = this.months();
    return {
      aria: { enabled: true },
      animation: chartAnimation(),
      textStyle: { color: text },
      legend: { top: 0, textStyle: { color: text } },
      grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: months.map((m) => this.monthName(m.month)),
        axisLabel: { color: text },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: color('--mat-sys-outline-variant') } },
      },
      series: [
        {
          name: t('evm.metrics.spi.short'),
          type: 'line',
          data: months.map((m) => m.spi ?? null),
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2, color: color('--mat-sys-primary') },
          itemStyle: { color: color('--mat-sys-primary') },
          markLine: {
            symbol: 'none',
            label: { color: text },
            data: [
              { yAxis: 0.8, lineStyle: { color: color('--kora-danger-fg'), type: 'dashed' } },
              { yAxis: 0.95, lineStyle: { color: color('--kora-warning-fg'), type: 'dotted' } },
            ],
          },
        },
        {
          name: t('evm.metrics.cpi.short'),
          type: 'line',
          data: months.map((m) => m.cpi ?? null),
          symbol: 'triangle',
          symbolSize: 8,
          lineStyle: { width: 2, type: 'dashed', color: color('--kora-info-fg') },
          itemStyle: { color: color('--kora-info-fg') },
        },
      ],
    };
  });
}
