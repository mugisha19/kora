import { Component, input, output } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScheduledTask } from '../../../../core/api/api.models';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { LinkView, linkLabel } from './schedule.store';

export interface LinkRemoval {
  link: LinkView;
  task: ScheduledTask;
}

/**
 * The schedule as a table (feature 10): every figure the Gantt draws, and every edit it offers,
 * reachable with the keyboard — the accessible alternative to dragging bars.
 */
@Component({
  selector: 'kora-schedule-table',
  imports: [
    LocalizedDatePipe,
    MatButton,
    MatIcon,
    MatIconButton,
    MatTooltip,
    StatusChip,
    TranslocoPipe,
  ],
  template: `
    <div
      class="wrap"
      role="region"
      tabindex="0"
      [attr.aria-label]="'schedule.tableLabel' | transloco"
    >
      <table>
        <caption class="visually-hidden">
          {{
            'schedule.tableCaption' | transloco
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ 'schedule.columns.task' | transloco }}</th>
            <th scope="col" class="num">{{ 'schedule.columns.duration' | transloco }}</th>
            <th scope="col">{{ 'schedule.columns.start' | transloco }}</th>
            <th scope="col">{{ 'schedule.columns.finish' | transloco }}</th>
            <th scope="col" class="num">{{ 'schedule.columns.totalFloat' | transloco }}</th>
            <th scope="col" class="num">{{ 'schedule.columns.freeFloat' | transloco }}</th>
            <th scope="col">{{ 'schedule.columns.critical' | transloco }}</th>
            @if (hasBaseline()) {
              <th scope="col">{{ 'schedule.columns.baseline' | transloco }}</th>
            }
            <th scope="col">{{ 'schedule.columns.predecessors' | transloco }}</th>
            @if (editable()) {
              <th scope="col">
                <span class="visually-hidden">{{ 'schedule.columns.actions' | transloco }}</span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of tasks(); track row.taskId) {
            <tr [class.critical]="row.critical">
              <th scope="row">
                <button type="button" class="task" (click)="opened.emit(row)">
                  <span class="key">{{ row.key }}</span
                  >&ngsp;<span>{{ row.title }}</span>
                </button>
              </th>
              <td class="num">
                @if (row.durationDays === 0) {
                  {{ 'schedule.milestone' | transloco }}
                } @else {
                  {{ 'schedule.days' | transloco: { count: row.durationDays } }}
                }
              </td>
              <td>{{ row.earlyStart | localizedDate: locale() }}</td>
              <td>{{ row.earlyFinish | localizedDate: locale() }}</td>
              <td class="num">{{ row.totalFloat }}</td>
              <td class="num">{{ row.freeFloat }}</td>
              <td>
                @if (row.critical) {
                  <kora-status-chip
                    tone="danger"
                    icon="flag"
                    [label]="'schedule.critical' | transloco"
                  />
                } @else {
                  <span class="kora-muted">{{ 'schedule.notCritical' | transloco }}</span>
                }
              </td>
              @if (hasBaseline()) {
                <td>
                  @if (row.baselineFinish) {
                    {{ row.baselineFinish | localizedDate: locale() }}
                    <span class="variance" [class.late]="(row.finishVariance ?? 0) > 0">
                      @if ((row.finishVariance ?? 0) > 0) {
                        {{ 'schedule.variance.late' | transloco: { days: row.finishVariance } }}
                      } @else if ((row.finishVariance ?? 0) < 0) {
                        {{
                          'schedule.variance.early'
                            | transloco: { days: -(row.finishVariance ?? 0) }
                        }}
                      } @else {
                        {{ 'schedule.variance.onPlan' | transloco }}
                      }
                    </span>
                  } @else {
                    <span class="kora-muted">{{ 'schedule.notInBaseline' | transloco }}</span>
                  }
                </td>
              }
              <td>
                <ul class="links">
                  @for (link of predecessors().get(row.taskId) ?? []; track link.dependency.id) {
                    <li>
                      <span
                        >{{ link.key }}&ngsp;<span class="type">{{ label(link) }}</span></span
                      >
                      @if (editable()) {
                        <button
                          mat-icon-button
                          type="button"
                          class="remove"
                          [attr.aria-label]="
                            'schedule.removeLink' | transloco: { from: link.key, to: row.key }
                          "
                          [matTooltip]="
                            'schedule.removeLink' | transloco: { from: link.key, to: row.key }
                          "
                          (click)="removed.emit({ link, task: row })"
                        >
                          <mat-icon svgIcon="link_off" aria-hidden="true" />
                        </button>
                      }
                    </li>
                  } @empty {
                    <li class="kora-muted">—</li>
                  }
                </ul>
              </td>
              @if (editable()) {
                <td class="actions">
                  <button
                    mat-button
                    type="button"
                    [attr.aria-label]="'schedule.editFor' | transloco: { key: row.key }"
                    (click)="edited.emit(row)"
                  >
                    <mat-icon svgIcon="edit" aria-hidden="true" />
                    {{ 'common.edit' | transloco }}
                  </button>
                  <button
                    mat-button
                    type="button"
                    [attr.aria-label]="'schedule.addLinkFor' | transloco: { key: row.key }"
                    (click)="linked.emit(row)"
                  >
                    <mat-icon svgIcon="link" aria-hidden="true" />
                    {{ 'schedule.addPredecessor' | transloco }}
                  </button>
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
      border-radius: var(--kora-radius, 8px);
    }
    .wrap:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    table {
      inline-size: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th,
    td {
      padding: var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
      vertical-align: middle;
      white-space: nowrap;
    }
    thead th {
      background: var(--mat-sys-surface-container-low);
      font: var(--mat-sys-label-large);
    }
    tbody th {
      font-weight: normal;
      white-space: normal;
      min-inline-size: 200px;
    }
    tr.critical th {
      box-shadow: inset 4px 0 var(--mat-sys-error);
    }
    .num {
      text-align: end;
    }
    .task {
      display: flex;
      gap: var(--kora-space-2);
      align-items: baseline;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .task:hover span:last-child {
      text-decoration: underline;
    }
    .task:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .key {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
    }
    .variance {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .variance.late {
      color: var(--mat-sys-error);
      font-weight: 600;
    }
    .links {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .links li {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
    }
    .type {
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      text-align: end;
    }
  `,
})
export class ScheduleTable {
  readonly tasks = input.required<readonly ScheduledTask[]>();
  readonly predecessors = input.required<ReadonlyMap<string, LinkView[]>>();
  readonly hasBaseline = input(false);
  readonly editable = input(false);
  readonly locale = input('en');

  readonly opened = output<ScheduledTask>();
  readonly edited = output<ScheduledTask>();
  readonly linked = output<ScheduledTask>();
  readonly removed = output<LinkRemoval>();

  protected label(link: LinkView): string {
    return linkLabel(link.dependency);
  }
}
