import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, form, required, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CreateDependencyRequest,
  DEPENDENCY_TYPES,
  DependencyType,
  ScheduleConstraint,
  ScheduledTask,
  Task,
  UpdateTaskRequest,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { loopOf } from './schedule.store';

const wholeNumber = (text: string, min: number, max: number, message: string) => {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max
    ? undefined
    : { kind: I18N_ERROR, message };
};

export interface TaskScheduleDialogData {
  task: Task;
  save: (changes: UpdateTaskRequest) => Promise<unknown>;
}

/** A task's duration and date constraint: the table view's keyboard route to what dragging does. */
@Component({
  selector: 'kora-task-schedule-dialog',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSuffix,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'schedule.editTitle' | transloco: { key: data.task.key } }}
    </h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        <p class="kora-muted">{{ data.task.title }}</p>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'schedule.fields.duration' | transloco }}</mat-label>
          <input matInput inputmode="numeric" [formField]="form.durationDays" />
          <span matTextSuffix>{{ 'schedule.daysSuffix' | transloco }}</span>
          <mat-hint>{{ 'schedule.hints.duration' | transloco }}</mat-hint>
          <mat-error><kora-field-error [field]="form.durationDays" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'schedule.fields.constraint' | transloco }}</mat-label>
          <mat-select [formField]="form.scheduleConstraint">
            <mat-option value="ASAP">{{ 'scheduleConstraint.ASAP' | transloco }}</mat-option>
            <mat-option value="START_NO_EARLIER_THAN">
              {{ 'scheduleConstraint.START_NO_EARLIER_THAN' | transloco }}
            </mat-option>
          </mat-select>
        </mat-form-field>
        @if (model().scheduleConstraint === 'START_NO_EARLIER_THAN') {
          <mat-form-field>
            <mat-label>{{ 'schedule.fields.constraintDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.constraintDate" />
            <mat-error><kora-field-error [field]="form.constraintDate" /></mat-error>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'common.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(380px, calc(100vw - 96px));
    }
    p {
      margin-block-start: 0;
    }
  `,
})
export class TaskScheduleDialog {
  protected readonly data = inject<TaskScheduleDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TaskScheduleDialog, boolean>);

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    durationDays:
      this.data.task.durationDays === undefined ? '1' : String(this.data.task.durationDays),
    scheduleConstraint: (this.data.task.scheduleConstraint ?? 'ASAP') as ScheduleConstraint,
    constraintDate: this.data.task.constraintDate ?? '',
  });
  protected readonly form = form(this.model, (path) => {
    validate(path.durationDays, ({ value }) =>
      wholeNumber(value(), 0, 1000, 'schedule.errors.duration'),
    );
    validate(path.constraintDate, ({ value, valueOf }) =>
      valueOf(path.scheduleConstraint) === 'START_NO_EARLIER_THAN' && !value()
        ? { kind: 'required' }
        : undefined,
    );
  });
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.model();
    const changes: UpdateTaskRequest = {
      durationDays: Number(m.durationDays),
      scheduleConstraint: m.scheduleConstraint,
      ...(m.scheduleConstraint === 'START_NO_EARLIER_THAN'
        ? { constraintDate: m.constraintDate }
        : {}),
    };
    if (await submitWithApi(this.form, this.context, () => this.data.save(changes))) {
      this.dialogRef.close(true);
    }
  }
}

export interface DependencyDialogData {
  tasks: readonly ScheduledTask[];
  /** The task the link goes into, when added from its row. */
  successorId?: string;
  save: (request: CreateDependencyRequest) => Promise<unknown>;
}

/**
 * Adds a dependency: predecessor, successor, type and lag (negative = lead). A link that would
 * close a loop is refused by the API; the dialog shows the chain of tasks it would form.
 */
@Component({
  selector: 'kora-dependency-dialog',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSelectTrigger,
    MatSuffix,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'schedule.addLinkTitle' | transloco }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (loop(); as chain) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <div>
              <p>{{ 'schedule.loop' | transloco }}</p>
              <p class="chain">{{ chain.join(' → ') }}</p>
            </div>
          </div>
        } @else if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'schedule.fields.predecessor' | transloco }}</mat-label>
          <mat-select [formField]="form.predecessorId">
            @for (t of data.tasks; track t.taskId) {
              <mat-option [value]="t.taskId">{{ t.key }} · {{ t.title }}</mat-option>
            }
          </mat-select>
          <mat-error><kora-field-error [field]="form.predecessorId" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'schedule.fields.successor' | transloco }}</mat-label>
          <mat-select [formField]="form.successorId">
            @for (t of data.tasks; track t.taskId) {
              <mat-option [value]="t.taskId">{{ t.key }} · {{ t.title }}</mat-option>
            }
          </mat-select>
          <mat-error><kora-field-error [field]="form.successorId" /></mat-error>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'schedule.fields.type' | transloco }}</mat-label>
            <mat-select [formField]="form.type">
              <mat-select-trigger>{{
                'dependencyType.' + model().type | transloco
              }}</mat-select-trigger>
              @for (type of types; track type) {
                <mat-option [value]="type">
                  {{ 'dependencyType.' + type | transloco }}
                  <span class="kora-muted">— {{ 'dependencyTypeHint.' + type | transloco }}</span>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'schedule.fields.lag' | transloco }}</mat-label>
            <input matInput inputmode="numeric" [formField]="form.lagDays" />
            <span matTextSuffix>{{ 'schedule.daysSuffix' | transloco }}</span>
            <mat-hint>{{ 'schedule.hints.lag' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.lagDays" /></mat-error>
          </mat-form-field>
        </div>
        @if (summary(); as rule) {
          <p class="kora-muted summary" aria-live="polite">
            {{ 'dependencyRule.' + rule.type | transloco: rule }}
            @if (rule.lag > 0) {
              {{ 'schedule.rule.lag' | transloco: { days: rule.lag } }}
            } @else if (rule.lag < 0) {
              {{ 'schedule.rule.lead' | transloco: { days: -rule.lag } }}
            }
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'schedule.addLink' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0 var(--kora-space-3);
    }
    .chain {
      font-weight: 600;
    }
    .summary {
      margin: 0;
    }
  `,
})
export class DependencyDialog {
  protected readonly data = inject<DependencyDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DependencyDialog, boolean>);

  protected readonly types = DEPENDENCY_TYPES;
  protected readonly formError = signal<string | null>(null);
  protected readonly loop = signal<string[] | null>(null);
  protected readonly model = signal({
    predecessorId: '',
    successorId: this.data.successorId ?? '',
    type: 'FS' as DependencyType,
    lagDays: '0',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.predecessorId);
    required(path.successorId);
    validate(path.successorId, ({ value, valueOf }) =>
      value() && value() === valueOf(path.predecessorId)
        ? { kind: I18N_ERROR, message: 'schedule.errors.self' }
        : undefined,
    );
    validate(path.lagDays, ({ value }) => wholeNumber(value(), -365, 365, 'schedule.errors.lag'));
  });
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };
  private readonly keyOf = (id: string) => this.data.tasks.find((t) => t.taskId === id)?.key;

  /** The rule in words: "AKG-005-3 can start once AKG-005-2 has finished, 2 working days later." */
  protected readonly summary = computed(() => {
    const m = this.model();
    const lag = Number(m.lagDays);
    if (!m.predecessorId || !m.successorId || m.predecessorId === m.successorId) return null;
    return {
      type: m.type,
      from: this.keyOf(m.predecessorId),
      to: this.keyOf(m.successorId),
      lag: Number.isInteger(lag) ? lag : 0,
    };
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.loop.set(null);
    const m = this.model();
    const request: CreateDependencyRequest = {
      predecessorId: m.predecessorId,
      successorId: m.successorId,
      type: m.type,
      lagDays: Number(m.lagDays),
    };
    const saved = await submitWithApi(
      this.form,
      this.context,
      () => this.data.save(request),
      (error) => {
        const loop = loopOf(error);
        if (loop) this.loop.set(loop);
        return loop !== null;
      },
    );
    if (saved) this.dialogRef.close(true);
  }
}
