import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { Burndown, Velocity } from '../../../../core/api/api.models';
import { LanguageService } from '../../../../core/i18n/language.service';
import { ThemeService } from '../../../../core/theme/theme.service';
import { chartAnimation, themeColor } from '../../../../shared/charts/theme-colors';
import { formatLocalizedDate } from '../../../../shared/forms/localized-date.pipe';

const TABLE_STYLES = `
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
  details {
    margin-block-start: var(--kora-space-2);
  }
  summary {
    cursor: pointer;
    color: var(--mat-sys-primary);
    font: var(--mat-sys-label-large);
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
  }
  th:first-child,
  td:first-child {
    text-align: start;
  }
`;

function palette(scheme: 'light' | 'dark') {
  return {
    text: themeColor('--mat-sys-on-surface-variant', scheme),
    grid: themeColor('--mat-sys-outline-variant', scheme),
    primary: themeColor('--mat-sys-primary', scheme),
    ideal: themeColor('--kora-neutral-fg', scheme),
    committed: themeColor('--kora-info-fg', scheme),
    average: themeColor('--kora-warning-fg', scheme),
  };
}

/**
 * Burndown (feature 09): story points left per day against the ideal line. The ideal line is
 * dashed and the actual one solid with markers, so they differ by shape too; the table under
 * "Show the data" has the same numbers.
 */
@Component({
  selector: 'kora-burndown-chart',
  imports: [NgxEchartsDirective, TranslocoPipe],
  template: `
    <figure>
      <figcaption>{{ 'sprints.burndown.title' | transloco }}</figcaption>
      @defer (on viewport) {
        <div class="chart" echarts [options]="options()" aria-hidden="true"></div>
      } @placeholder {
        <div class="chart" aria-hidden="true"></div>
      }
      <details>
        <summary>{{ 'charts.showData' | transloco }}</summary>
        <table>
          <caption class="visually-hidden">
            {{
              'sprints.burndown.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'sprints.burndown.day' | transloco }}</th>
              <th scope="col">{{ 'sprints.burndown.ideal' | transloco }}</th>
              <th scope="col">{{ 'sprints.burndown.actual' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (day of burndown().days; track day.date) {
              <tr>
                <th scope="row">{{ date(day.date) }}</th>
                <td>{{ day.idealRemaining }}</td>
                <td>{{ day.actualRemaining ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </details>
    </figure>
  `,
  styles: TABLE_STYLES,
})
export class BurndownChart {
  readonly burndown = input.required<Burndown>();

  private readonly theme = inject(ThemeService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$);

  protected date(isoDate: string): string {
    return formatLocalizedDate(isoDate, this.language.current(), 'medium');
  }

  protected readonly options = computed<EChartsCoreOption>(() => {
    this.lang();
    const colors = palette(this.theme.scheme());
    const days = this.burndown().days;
    const t = (key: string) => this.transloco.translate(key);
    return {
      aria: { enabled: true },
      animation: chartAnimation(),
      textStyle: { color: colors.text },
      legend: { top: 0, textStyle: { color: colors.text } },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: days.map((d) => formatLocalizedDate(d.date, this.language.current(), 'short')),
        axisLabel: { color: colors.text },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: colors.text },
        splitLine: { lineStyle: { color: colors.grid } },
      },
      series: [
        {
          name: t('sprints.burndown.ideal'),
          type: 'line',
          data: days.map((d) => d.idealRemaining),
          symbol: 'none',
          lineStyle: { type: 'dashed', color: colors.ideal },
          itemStyle: { color: colors.ideal },
        },
        {
          name: t('sprints.burndown.actual'),
          type: 'line',
          data: days.map((d) => d.actualRemaining ?? null),
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 3, color: colors.primary },
          itemStyle: { color: colors.primary },
        },
      ],
    };
  });
}

/**
 * Velocity (feature 09): committed and completed points of the last closed sprints, with the
 * average as a line. The range under the chart is the honest forecast.
 */
@Component({
  selector: 'kora-velocity-chart',
  imports: [NgxEchartsDirective, TranslocoPipe],
  template: `
    <figure>
      <figcaption>{{ 'sprints.velocity.title' | transloco }}</figcaption>
      @if (velocity().sprints.length) {
        @defer (on viewport) {
          <div class="chart" echarts [options]="options()" aria-hidden="true"></div>
        } @placeholder {
          <div class="chart" aria-hidden="true"></div>
        }
        <p class="forecast">
          {{
            'sprints.velocity.forecast'
              | transloco
                : { average: velocity().average, low: velocity().low, high: velocity().high }
          }}
        </p>
        <details>
          <summary>{{ 'charts.showData' | transloco }}</summary>
          <table>
            <caption class="visually-hidden">
              {{
                'sprints.velocity.title' | transloco
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ 'sprints.velocity.sprint' | transloco }}</th>
                <th scope="col">{{ 'sprints.velocity.committed' | transloco }}</th>
                <th scope="col">{{ 'sprints.velocity.completed' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (s of velocity().sprints; track s.sprintId) {
                <tr>
                  <th scope="row">{{ s.name }}</th>
                  <td>{{ s.committedPoints }}</td>
                  <td>{{ s.completedPoints }}</td>
                </tr>
              }
            </tbody>
          </table>
        </details>
      } @else {
        <p class="kora-muted">{{ 'sprints.velocity.none' | transloco }}</p>
      }
    </figure>
  `,
  styles: `
    ${TABLE_STYLES}
    .forecast {
      margin: var(--kora-space-2) 0 0;
    }
  `,
})
export class VelocityChart {
  readonly velocity = input.required<Velocity>();

  private readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$);

  protected readonly options = computed<EChartsCoreOption>(() => {
    this.lang();
    const colors = palette(this.theme.scheme());
    const { sprints, average } = this.velocity();
    const t = (key: string) => this.transloco.translate(key);
    return {
      aria: { enabled: true, decal: { show: true } },
      animation: chartAnimation(),
      textStyle: { color: colors.text },
      legend: { top: 0, textStyle: { color: colors.text } },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: sprints.map((s) => s.name),
        axisLabel: { color: colors.text },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: colors.text },
        splitLine: { lineStyle: { color: colors.grid } },
      },
      series: [
        {
          name: t('sprints.velocity.committed'),
          type: 'bar',
          data: sprints.map((s) => s.committedPoints),
          itemStyle: { color: colors.committed },
        },
        {
          name: t('sprints.velocity.completed'),
          type: 'bar',
          data: sprints.map((s) => s.completedPoints),
          itemStyle: { color: colors.primary },
          label: { show: true, position: 'top', color: colors.text },
          ...(average !== undefined
            ? {
                markLine: {
                  symbol: 'none',
                  data: [{ yAxis: average, name: t('sprints.velocity.average') }],
                  lineStyle: { type: 'dashed', color: colors.average, width: 2 },
                  label: { formatter: `${t('sprints.velocity.average')}: {c}`, color: colors.text },
                },
              }
            : {}),
        },
      ],
    };
  });
}
