import { Component, computed, inject, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ResourceHeatmap as Heatmap, ResourceWeek, UserRef } from '../../core/api/api.models';
import { LanguageService } from '../../core/i18n/language.service';
import { BAND_ICON } from '../../shared/ui/time-look';

/**
 * The capacity heat map (feature 16): people × weeks. Each cell says the utilization in percent
 * and its band in words ("120% · Over"), with an icon of its own shape, so over-allocation reads
 * without colour; the hours behind it are in the cell's description.
 */
@Component({
  selector: 'kora-resource-heatmap',
  imports: [MatIcon, TranslocoPipe],
  template: `
    <div
      class="wrap"
      role="region"
      tabindex="0"
      [attr.aria-label]="'resources.heatmapLabel' | transloco"
    >
      <table>
        <caption class="visually-hidden">
          {{
            'resources.caption' | transloco
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ 'resources.person' | transloco }}</th>
            @for (week of weekLabels(); track week.start) {
              <th scope="col">
                <span class="visually-hidden">{{ 'resources.weekOf' | transloco }}</span>
                {{ week.label }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (person of data().people; track person.user.userId) {
            <tr>
              <th scope="row">
                <button type="button" class="person" (click)="opened.emit(person.user)">
                  {{ person.user.fullName }}
                </button>
              </th>
              @for (week of person.weeks; track week.weekStart) {
                <td
                  [class]="'cell ' + (week.band ? 'band-' + week.band.toLowerCase() : 'band-none')"
                >
                  @if (week.band && week.utilization !== undefined) {
                    <span class="value">
                      <mat-icon [svgIcon]="icons[week.band]" aria-hidden="true" />
                      {{ percent(week.utilization) }}
                    </span>
                    <span class="word">{{ 'utilizationBand.' + week.band | transloco }}</span>
                  } @else {
                    <span class="value">—</span>
                    <span class="word">{{ 'resources.noCapacity' | transloco }}</span>
                  }
                  <span class="visually-hidden">{{
                    'resources.cellDetail' | transloco: detail(week)
                  }}</span>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-inline-size: 0;
    }
    .wrap {
      overflow-x: auto;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
    }
    .wrap:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    table {
      border-collapse: separate;
      border-spacing: 2px;
      font: var(--mat-sys-body-small);
    }
    th {
      padding: var(--kora-space-1) var(--kora-space-2);
      font: var(--mat-sys-label-medium);
      text-align: start;
      white-space: nowrap;
    }
    thead th {
      color: var(--mat-sys-on-surface-variant);
    }
    .person {
      padding: 0;
      border: 0;
      background: none;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-body-medium);
      text-align: start;
      cursor: pointer;
    }
    .person:hover {
      text-decoration: underline;
    }
    .person:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .cell {
      min-inline-size: 64px;
      padding: 4px 6px;
      border-radius: 4px;
      text-align: center;
    }
    .value {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 2px;
      font: var(--mat-sys-label-large);
      font-weight: 700;
    }
    .word {
      display: block;
      font: var(--mat-sys-label-small);
    }
    mat-icon {
      inline-size: 14px;
      block-size: 14px;
    }
    .band-under {
      color: var(--kora-info-fg);
      background: var(--kora-info-bg);
    }
    .band-healthy {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
    .band-over {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
    }
    .band-none {
      color: var(--kora-neutral-fg);
      background: var(--kora-neutral-bg);
    }
  `,
})
export class ResourceHeatmap {
  readonly data = input.required<Heatmap>();
  readonly opened = output<UserRef>();

  private readonly language = inject(LanguageService);
  protected readonly icons = BAND_ICON;

  protected readonly weekLabels = computed(() => {
    const format = new Intl.DateTimeFormat(this.language.current(), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const weeks = this.data().people[0]?.weeks ?? [];
    return weeks.map((w) => ({ start: w.weekStart, label: format.format(new Date(w.weekStart)) }));
  });

  protected percent(value: number): string {
    return new Intl.NumberFormat(this.language.current(), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(value / 100);
  }

  private hours(value: number): string {
    return new Intl.NumberFormat(this.language.current(), { maximumFractionDigits: 2 }).format(
      value,
    );
  }

  /** The figures behind a cell: planned, capacity and logged hours. */
  protected detail(week: ResourceWeek) {
    return {
      allocated: this.hours(week.allocatedHours),
      capacity: this.hours(week.capacityHours),
      actual: this.hours(week.actualHours),
    };
  }
}
