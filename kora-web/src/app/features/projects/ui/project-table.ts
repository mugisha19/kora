import { Component, inject, input, output } from '@angular/core';
import { MatSort, MatSortHeader, Sort } from '@angular/material/sort';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Project } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../shared/forms/localized-date.pipe';
import { HealthChip, ProjectStatusChip } from '../../../shared/ui/health-chip';

export type ProjectColumn = 'code' | 'name' | 'manager' | 'status' | 'health' | 'targetEndDate';

/**
 * Projects as a table: code, name (a link to the workspace), manager, status, health and target
 * end date. Sorting is optional and server-side: the table only reports what was clicked.
 */
@Component({
  selector: 'kora-project-table',
  imports: [
    HealthChip,
    LocalizedDatePipe,
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    MatSort,
    MatSortHeader,
    MatTable,
    ProjectStatusChip,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <div class="table-wrap">
      <table
        mat-table
        [dataSource]="projects()"
        matSort
        matSortDisableClear
        [matSortActive]="sortActive() ?? ''"
        [matSortDirection]="sortDirection()"
        (matSortChange)="sortChange.emit($event)"
      >
        <caption class="visually-hidden">
          {{
            caption()
          }}
        </caption>

        <ng-container matColumnDef="code">
          <th mat-header-cell *matHeaderCellDef mat-sort-header [disabled]="!sortable()">
            {{ 'projects.fields.code' | transloco }}
          </th>
          <td mat-cell *matCellDef="let project" class="code">{{ project.code }}</td>
        </ng-container>

        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef mat-sort-header [disabled]="!sortable()">
            {{ 'projects.fields.name' | transloco }}
          </th>
          <td mat-cell *matCellDef="let project">
            <a [routerLink]="['/projects', project.id]">{{ project.name }}</a>
            <span class="secondary small-only">{{ project.manager.fullName }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="manager">
          <th mat-header-cell *matHeaderCellDef class="wide-only">
            {{ 'projects.fields.manager' | transloco }}
          </th>
          <td mat-cell *matCellDef="let project" class="wide-only">
            {{ project.manager.fullName }}
          </td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef mat-sort-header [disabled]="!sortable()">
            {{ 'projects.fields.status' | transloco }}
          </th>
          <td mat-cell *matCellDef="let project">
            <kora-project-status-chip [status]="project.status" />
          </td>
        </ng-container>

        <ng-container matColumnDef="health">
          <th mat-header-cell *matHeaderCellDef>{{ 'projects.fields.health' | transloco }}</th>
          <td mat-cell *matCellDef="let project">
            <kora-health-chip
              [health]="project.health"
              [overridden]="project.healthOverridden"
              [reason]="project.healthReason"
            />
          </td>
        </ng-container>

        <ng-container matColumnDef="targetEndDate">
          <th
            mat-header-cell
            *matHeaderCellDef
            mat-sort-header
            [disabled]="!sortable()"
            class="wide-only"
          >
            {{ 'projects.fields.targetEndDate' | transloco }}
          </th>
          <td mat-cell *matCellDef="let project" class="wide-only">
            {{ project.targetEndDate | localizedDate: language.current() }}
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns()"></tr>
        <tr mat-row *matRowDef="let row; columns: columns()"></tr>
      </table>
    </div>
  `,
  styleUrl: '../../../shared/ui/data-table.scss',
  styles: `
    .code {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ProjectTable {
  readonly projects = input.required<readonly Project[]>();
  readonly caption = input.required<string>();
  readonly columns = input<ProjectColumn[]>([
    'code',
    'name',
    'manager',
    'status',
    'health',
    'targetEndDate',
  ]);
  readonly sortable = input(false);
  readonly sortActive = input<string | null>(null);
  readonly sortDirection = input<'asc' | 'desc'>('asc');
  readonly sortChange = output<Sort>();

  protected readonly language = inject(LanguageService);
}
