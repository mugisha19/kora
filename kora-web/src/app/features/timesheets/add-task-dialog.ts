import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ProjectsApi } from '../../core/api/projects.api';
import { TasksApi } from '../../core/api/tasks.api';
import { NewRow } from './timesheet.store';

export interface AddTaskDialogData {
  /** Tasks already in the grid, left out of the choice. */
  present: readonly string[];
}

/** Picks a task to log time on: a running project, then one of its tasks. */
@Component({
  selector: 'kora-add-task-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatHint,
    MatLabel,
    MatOption,
    MatSelect,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'timesheets.addTaskTitle' | transloco }}</h2>
    <mat-dialog-content>
      <mat-form-field>
        <mat-label>{{ 'timesheets.project' | transloco }}</mat-label>
        <mat-select [value]="projectId()" (selectionChange)="chooseProject($event.value)">
          @for (p of projects.value() ?? []; track p.id) {
            <mat-option [value]="p.id">{{ p.code }} · {{ p.name }}</mat-option>
          }
        </mat-select>
        <mat-hint>{{ 'timesheets.projectHint' | transloco }}</mat-hint>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'timesheets.task' | transloco }}</mat-label>
        <mat-select
          [value]="taskId()"
          [disabled]="!projectId()"
          (selectionChange)="taskId.set($event.value)"
        >
          @for (t of choices(); track t.id) {
            <mat-option [value]="t.id">{{ t.key }} · {{ t.title }}</mat-option>
          }
        </mat-select>
        @if (projectId() && tasks.hasValue() && !choices().length) {
          <mat-hint>{{ 'timesheets.noTasks' | transloco }}</mat-hint>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="button" [disabled]="!chosen()" (click)="add()">
        {{ 'timesheets.addTask' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: var(--kora-space-2);
      min-inline-size: min(440px, calc(100vw - 96px));
    }
  `,
})
export class AddTaskDialog {
  private readonly data = inject<AddTaskDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<AddTaskDialog, NewRow>);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly tasksApi = inject(TasksApi);

  protected readonly projectId = signal<string | null>(null);
  protected readonly taskId = signal<string | null>(null);

  protected readonly projects = resource({
    loader: async () =>
      (
        await firstValueFrom(
          this.projectsApi.list({ status: 'IN_PROGRESS', size: 100, sort: ['code,asc'] }),
        )
      ).content,
  });
  protected readonly tasks = resource({
    params: () => this.projectId() ?? undefined,
    loader: ({ params }) =>
      firstValueFrom(this.tasksApi.list(params, { size: 100, sort: ['key,asc'] })),
  });
  protected readonly choices = computed(() =>
    (this.tasks.value()?.content ?? []).filter((t) => !this.data.present.includes(t.id)),
  );
  protected readonly chosen = computed(() => this.choices().find((t) => t.id === this.taskId()));

  protected chooseProject(projectId: string): void {
    this.projectId.set(projectId);
    this.taskId.set(null);
  }

  protected add(): void {
    const task = this.chosen();
    if (!task) return;
    this.dialogRef.close({
      taskId: task.id,
      taskKey: task.key,
      taskTitle: task.title,
      projectId: task.projectId,
    });
  }
}
