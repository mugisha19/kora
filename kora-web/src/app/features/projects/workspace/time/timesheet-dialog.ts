import { Component, computed, inject, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { TimesheetSummary } from '../../../../core/api/api.models';
import { TimesheetsApi } from '../../../../core/api/timesheets.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { daysOfWeek, isoWeekOf } from '../../../../shared/format/iso-week';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { addHours, formatHours } from '../../../../shared/format/hours';

/** One person's week on the project: tasks × days, read-only, for the approver. */
@Component({
  selector: 'kora-timesheet-dialog',
  imports: [
    ErrorState,
    LoadingState,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'time.sheetTitle' | transloco: { name: data.user.fullName, week: week().slice(6) } }}
    </h2>
    <mat-dialog-content>
      @if (sheet.value(); as s) {
        <div class="wrap" role="region" tabindex="0" [attr.aria-label]="'time.entries' | transloco">
          <table>
            <caption class="visually-hidden">
              {{
                'time.entries' | transloco
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ 'timesheets.task' | transloco }}</th>
                @for (day of dayNames(); track $index) {
                  <th scope="col" class="num">{{ day }}</th>
                }
                <th scope="col" class="num">{{ 'timesheets.total' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.key) {
                <tr>
                  <th scope="row">
                    {{ row.key }} <span class="title">{{ row.title }}</span>
                  </th>
                  @for (h of row.hours; track $index) {
                    <td class="num">{{ format(h) }}</td>
                  }
                  <td class="num total">{{ format(row.total) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (notes().length) {
          <h3>{{ 'time.notes' | transloco }}</h3>
          <ul>
            @for (n of notes(); track $index) {
              <li>{{ n }}</li>
            }
          </ul>
        }
      } @else if (sheet.error()) {
        <kora-error-state (retry)="sheet.reload()" />
      } @else {
        <kora-loading-state />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close>
        {{ 'common.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .wrap {
      overflow-x: auto;
    }
    table {
      border-collapse: collapse;
      font: var(--mat-sys-body-small);
    }
    th,
    td {
      padding: var(--kora-space-1) var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
    }
    tbody th {
      font-weight: normal;
    }
    .num {
      text-align: end;
    }
    .total {
      font-weight: 600;
    }
    .title {
      color: var(--mat-sys-on-surface-variant);
    }
    h3 {
      margin: var(--kora-space-3) 0 var(--kora-space-1);
      font: var(--mat-sys-title-small);
    }
  `,
})
export class TimesheetDialog {
  protected readonly data = inject<TimesheetSummary>(MAT_DIALOG_DATA);
  private readonly api = inject(TimesheetsApi);
  private readonly language = inject(LanguageService);

  protected readonly week = computed(() => isoWeekOf(this.data.weekStart));
  protected readonly sheet = resource({ loader: () => firstValueFrom(this.api.get(this.data.id)) });
  protected readonly dayNames = computed(() => {
    const format = new Intl.DateTimeFormat(this.language.current(), {
      weekday: 'short',
      timeZone: 'UTC',
    });
    return daysOfWeek(this.week()).map((d) => format.format(new Date(d)));
  });
  protected readonly rows = computed(() => {
    const days = daysOfWeek(this.week());
    const map = new Map<string, { key: string; title: string; hours: number[] }>();
    for (const e of this.sheet.value()?.entries ?? []) {
      const row = map.get(e.taskKey) ?? {
        key: e.taskKey,
        title: e.taskTitle,
        hours: Array(7).fill(0),
      };
      const d = days.indexOf(e.date);
      if (d >= 0) row.hours[d] = addHours([row.hours[d], e.hours]);
      map.set(e.taskKey, row);
    }
    return [...map.values()].map((r) => ({ ...r, total: addHours(r.hours) }));
  });
  protected readonly notes = computed(() =>
    (this.sheet.value()?.entries ?? []).flatMap((e) => (e.note ? [`${e.taskKey}: ${e.note}`] : [])),
  );

  protected format(hours: number): string {
    return formatHours(hours, this.language.current()) || '—';
  }
}
