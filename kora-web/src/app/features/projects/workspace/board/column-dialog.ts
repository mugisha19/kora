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
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { BoardColumnSettings, BoardStatus } from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';

export interface ColumnDialogData {
  status: BoardStatus;
  name: string;
  wipLimit?: number;
  save: (settings: BoardColumnSettings) => Promise<unknown>;
}

/** Rename a board column and set (or clear) its WIP limit. */
@Component({
  selector: 'kora-column-dialog',
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
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'board.columnTitle' | transloco }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'board.columnName' | transloco }}</mat-label>
          <input matInput [formField]="form.name" />
          <mat-error><kora-field-error [field]="form.name" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'board.wipLimit' | transloco }}</mat-label>
          <input matInput inputmode="numeric" [formField]="form.wipLimit" />
          <mat-hint>{{ 'board.wipHint' | transloco }}</mat-hint>
          <mat-error><kora-field-error [field]="form.wipLimit" /></mat-error>
        </mat-form-field>
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
  `,
})
export class ColumnDialog {
  private readonly data = inject<ColumnDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ColumnDialog, BoardColumnSettings>);

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    name: this.data.name,
    wipLimit: this.data.wipLimit === undefined ? '' : String(this.data.wipLimit),
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 40);
    validate(path.wipLimit, ({ value }) => {
      if (!value().trim()) return undefined;
      const limit = Number(value());
      return Number.isInteger(limit) && limit >= 1 && limit <= 100
        ? undefined
        : { kind: I18N_ERROR, message: 'board.wipInvalid' };
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
    const { name, wipLimit } = this.model();
    const settings: BoardColumnSettings = {
      status: this.data.status,
      name: name.trim(),
      ...(wipLimit.trim() ? { wipLimit: Number(wipLimit) } : {}),
    };
    if (await submitWithApi(this.form, this.context, () => this.data.save(settings))) {
      this.dialogRef.close(settings);
    }
  }
}
