import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
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
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldError } from '../../../../shared/forms/field-error';

export interface ReasonDialogData {
  title: string;
  label: string;
  confirm: string;
}

/** Asks for a short reason (blocking a task); resolves with it, or nothing when cancelled. */
@Component({
  selector: 'kora-reason-dialog',
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
    MatInput,
    MatLabel,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        <mat-form-field>
          <mat-label>{{ data.label }}</mat-label>
          <textarea matInput rows="3" [formField]="form.reason"></textarea>
          <mat-error><kora-field-error [field]="form.reason" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit">{{ data.confirm }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(420px, calc(100vw - 96px));
    }
  `,
})
export class ReasonDialog {
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ReasonDialog, string>);
  protected readonly model = signal({ reason: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.reason);
    maxLength(path.reason, 500);
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      this.dialogRef.close(this.model().reason.trim());
      return undefined;
    });
  }
}
