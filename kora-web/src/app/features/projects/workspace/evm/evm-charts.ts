import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EvmSeries, Money } from '../../../../core/api/api.models';
import { LanguageService } from '../../../../core/i18n/language.service';
import { ThemeService } from '../../../../core/theme/theme.service';
import { chartAnimation, themeColor } from '../../../../shared/charts/theme-colors';
import { formatLocalizedDate } from '../../../../shared/forms/localized-date.pipe';
import { formatMoney } from '../../../../shared/format/money';

/** A chart coordinate from a money amount (display only; the figures stay decimal strings). */
const plot = (money: Money | undefined) => (money ? Number(money.amount) : null);

/** The index's zone: below 0.80 off track, below 0.95 at risk, else on track (the health rule). */
export function indexZone(value: number): 'OFF' | 'RISK' | 'ON' {
  if (value < 0.8) return 'OFF';
  if (value < 0.95) return 'RISK';
  return 'ON';
}

/**
 * The S-curve (feature 17): cumulative PV, EV and AC per week, with BAC and EAC as horizontal
 * lines. Each line has its own dash pattern and marker shape, not only its colour; the table
 * under "Show the data" has the same figures.
 */
@Component({
  selector: 'kora-s-curve',
  imports: [NgxEchartsDirective, TranslocoPipe],
  template: `
    <figure>
      <figcaption>{{ 'evm.curve.title' | transloco }}</figcaption>
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
          [attr.aria-label]="'evm.curve.title' | transloco"
        >
          <table>
            <caption class="visually-hidden">
              {{
                'evm.curve.title' | transloco
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ 'evm.curve.weekEnding' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.pv.short' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.ev.short' | transloco }}</th>
                <th scope="col">{{ 'evm.metrics.ac.short' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (p of series().points; track p.weekEnding) {
                <tr>
                  <th scope="row">{{ date(p.weekEnding) }}</th>
                  <td>{{ money(p.pv) }}</td>
                  <td>{{ money(p.ev) || '—' }}</td>
                  <td>{{ money(p.ac) || '—' }}</td>
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
      block-size: 300px;
    }
    details {
      margin-block-start: var(--kora-space-2);
    }
    summary {
      cursor: pointer;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-label-large);
    }
    .wrap {
      max-block-size: 320px;
      overflow: auto;
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
export class SCurveChart {
  readonly series = input.required<EvmSeries>();
  readonly eac = input<Money>();

  private readonly theme = inject(ThemeService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$);

  protected date(isoDate: string): string {
    return formatLocalizedDate(isoDate, this.language.current(), 'medium');
  }

  protected money(value: Money | undefined): string {
    return formatMoney(value, this.language.current());
  }

  protected readonly options = computed<EChartsCoreOption>(() => {
    this.lang();
    const scheme = this.theme.scheme();
    const color = (token: string) => themeColor(token, scheme);
    const text = color('--mat-sys-on-surface-variant');
    const t = (key: string) => this.transloco.translate(key);
    const points = this.series().points;
    const bac = plot(this.series().bac);
    const eac = plot(this.eac());
    const lines = [
      ...(bac !== null ? [{ name: t('evm.metrics.bac.short'), yAxis: bac, dash: 'dashed' }] : []),
      ...(eac !== null ? [{ name: t('evm.metrics.eac.short'), yAxis: eac, dash: 'dotted' }] : []),
    ];
    const line = (
      name: string,
      data: (number | null)[],
      token: string,
      symbol: string,
      dash: string,
    ) => ({
      name,
      type: 'line',
      data,
      symbol,
      symbolSize: 6,
      connectNulls: false,
      lineStyle: { width: 2, type: dash, color: color(token) },
      itemStyle: { color: color(token) },
    });
    return {
      aria: { enabled: true },
      animation: chartAnimation(),
      textStyle: { color: text },
      legend: { top: 0, textStyle: { color: text } },
      grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: points.map((p) =>
          formatLocalizedDate(p.weekEnding, this.language.current(), 'short'),
        ),
        axisLabel: { color: text },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: text,
          formatter: (value: number) =>
            new Intl.NumberFormat(this.language.current(), { notation: 'compact' }).format(value),
        },
        splitLine: { lineStyle: { color: color('--mat-sys-outline-variant') } },
      },
      series: [
        {
          ...line(
            t('evm.metrics.pv.short'),
            points.map((p) => plot(p.pv)),
            '--kora-neutral-fg',
            'none',
            'dashed',
          ),
          markLine: {
            symbol: 'none',
            label: { formatter: '{b}', color: text },
            lineStyle: { color: color('--kora-warning-fg') },
            data: lines.map((l) => ({ name: l.name, yAxis: l.yAxis, lineStyle: { type: l.dash } })),
          },
        },
        line(
          t('evm.metrics.ev.short'),
          points.map((p) => plot(p.ev)),
          '--mat-sys-primary',
          'circle',
          'solid',
        ),
        line(
          t('evm.metrics.ac.short'),
          points.map((p) => plot(p.ac)),
          '--kora-danger-fg',
          'triangle',
          'solid',
        ),
      ],
    };
  });
}

/**
 * An index (SPI or CPI) on a half dial from 0 to 1.5, with the health rule's zones (off track
 * below 0.80, at risk below 0.95). The value and its zone are written out; the dial is decoration.
 */
@Component({
  selector: 'kora-index-gauge',
  imports: [TranslocoPipe],
  template: `
    <figure>
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path class="zone off" [attr.d]="arc(0, 0.8)" />
        <path class="zone risk" [attr.d]="arc(0.8, 0.95)" />
        <path class="zone on" [attr.d]="arc(0.95, 1.5)" />
        @if (value() !== undefined) {
          <line class="needle" x1="60" y1="62" [attr.x2]="needle().x" [attr.y2]="needle().y" />
        }
        <circle class="hub" cx="60" cy="62" r="4" />
      </svg>
      <figcaption>
        <span class="name">{{ label() }}</span>
        @if (value(); as v) {
          <span class="value">{{ v.toFixed(2) }}</span>
          <span [class]="'zone-word ' + zone()">{{ 'evm.zone.' + zone() | transloco }}</span>
        } @else {
          <span class="value">—</span>
        }
      </figcaption>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
      text-align: center;
    }
    svg {
      inline-size: 160px;
      max-inline-size: 100%;
    }
    .zone {
      fill: none;
      stroke-width: 12;
    }
    .off {
      stroke: var(--kora-danger-bg);
    }
    .risk {
      stroke: var(--kora-warning-bg);
    }
    .on {
      stroke: var(--kora-success-bg);
    }
    .needle {
      stroke: var(--mat-sys-on-surface);
      stroke-width: 3;
      stroke-linecap: round;
    }
    .hub {
      fill: var(--mat-sys-on-surface);
    }
    figcaption {
      display: grid;
      gap: 2px;
    }
    .name {
      font: var(--mat-sys-label-large);
    }
    .value {
      font: var(--mat-sys-headline-small);
    }
    .zone-word {
      justify-self: center;
      padding: 0 var(--kora-space-2);
      border-radius: 999px;
      font: var(--mat-sys-label-medium);
    }
    .zone-word.OFF {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
    }
    .zone-word.RISK {
      color: var(--kora-warning-fg);
      background: var(--kora-warning-bg);
    }
    .zone-word.ON {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
  `,
})
export class IndexGauge {
  readonly label = input.required<string>();
  readonly value = input<number>();

  protected readonly zone = computed(() => indexZone(this.value() ?? 0));

  private point(value: number, radius = 50) {
    const angle = Math.PI * (1 - Math.min(Math.max(value, 0), 1.5) / 1.5);
    return { x: 60 + radius * Math.cos(angle), y: 62 - radius * Math.sin(angle) };
  }

  protected arc(from: number, to: number): string {
    const a = this.point(from);
    const b = this.point(to);
    return `M${a.x},${a.y} A50,50 0 0 1 ${b.x},${b.y}`;
  }

  protected readonly needle = computed(() => this.point(this.value() ?? 0, 42));
}
