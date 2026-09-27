import { Component, ElementRef, Injector, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CARRY_OVER_TO_BACKLOG,
  CreateSprintRequest,
  Sprint,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';

const DIALOG_IMPORTS = [
  FieldError,
  FormField,
  MatButton,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MatError,
  MatFormField,
  MatIcon,
  MatLabel,
  TranslocoPipe,
];

// ---------- Plan or edit a sprint ----------

export interface SprintDialogData {
  sprint?: Sprint;
  /** Suggested dates for a new sprint (the day after the last one, two weeks). */
  suggested?: { name: string; startDate: string; endDate: string };
  save: (request: CreateSprintRequest) => Promise<Sprint>;
}

@Component({
  selector: 'kora-sprint-dialog',
  imports: [...DIALOG_IMPORTS, MatInput],
  template: `
    <h2 mat-dialog-title>
      {{ (data.sprint ? 'sprints.editTitle' : 'sprints.createTitle') | transloco }}
    </h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'sprints.fields.name' | transloco }}</mat-label>
          <input matInput [formField]="form.name" />
          <mat-error><kora-field-error [field]="form.name" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'sprints.fields.goal' | transloco }}</mat-label>
          <textarea matInput rows="2" [formField]="form.goal"></textarea>
          <mat-error><kora-field-error [field]="form.goal" /></mat-error>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'sprints.fields.startDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.startDate" />
            <mat-error><kora-field-error [field]="form.startDate" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'sprints.fields.endDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.endDate" />
            <mat-error><kora-field-error [field]="form.endDate" /></mat-error>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.sprint ? 'common.save' : 'sprints.create') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      column-gap: var(--kora-space-3);
    }
    .row mat-form-field {
      flex: 1 1 160px;
    }
  `,
})
export class SprintDialog {
  protected readonly data = inject<SprintDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<SprintDialog, Sprint>);

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    name: this.data.sprint?.name ?? this.data.suggested?.name ?? '',
    goal: this.data.sprint?.goal ?? '',
    startDate: this.data.sprint?.startDate ?? this.data.suggested?.startDate ?? '',
    endDate: this.data.sprint?.endDate ?? this.data.suggested?.endDate ?? '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 100);
    maxLength(path.goal, 500);
    required(path.startDate);
    required(path.endDate);
    validate(path.endDate, ({ value, valueOf }) => {
      const start = valueOf(path.startDate);
      return start && value() && value() < start
        ? { kind: I18N_ERROR, message: 'sprints.errors.endBeforeStart' }
        : undefined;
    });
  });
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const { name, goal, startDate, endDate } = this.model();
    const request: CreateSprintRequest = {
      name: name.trim(),
      ...(goal.trim() ? { goal: goal.trim() } : {}),
      startDate,
      endDate,
    };
    let saved: Sprint | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(request);
    });
    if (ok) this.dialogRef.close(saved);
  }
}

// ---------- Close a sprint ----------

export interface CloseSprintDialogData {
  sprint: Sprint;
  unfinished: number;
  unfinishedPoints: number;
  planned: readonly Sprint[];
  close: (carryOverTo: string) => Promise<Sprint>;
}

/** Closing records the completed points; unfinished tasks go to a planned sprint or the backlog. */
@Component({
  selector: 'kora-close-sprint-dialog',
  imports: [
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    MatRadioButton,
    MatRadioGroup,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'sprints.closeTitle' | transloco: { name: data.sprint.name } }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <p>
          {{
            'sprints.closeMessage'
              | transloco: { count: data.unfinished, points: data.unfinishedPoints }
          }}
        </p>
        @if (data.unfinished > 0) {
          <fieldset>
            <legend>{{ 'sprints.carryOverTo' | transloco }}</legend>
            <mat-radio-group [formField]="form.carryOverTo" class="choices">
              @for (sprint of data.planned; track sprint.id) {
                <mat-radio-button [value]="sprint.id">{{ sprint.name }}</mat-radio-button>
              }
              <mat-radio-button [value]="backlog">{{
                'sprints.toBacklog' | transloco
              }}</mat-radio-button>
            </mat-radio-group>
          </fieldset>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'sprints.close' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      font: var(--mat-sys-title-small);
    }
    .choices {
      display: flex;
      flex-direction: column;
    }
  `,
})
export class CloseSprintDialog {
  protected readonly data = inject<CloseSprintDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CloseSprintDialog, Sprint>);

  protected readonly backlog = CARRY_OVER_TO_BACKLOG;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    carryOverTo: this.data.planned[0]?.id ?? CARRY_OVER_TO_BACKLOG,
  });
  protected readonly form = form(this.model, (path) => required(path.carryOverTo));
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    let closed: Sprint | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      closed = await this.data.close(this.model().carryOverTo);
    });
    if (ok) this.dialogRef.close(closed);
  }
}
