import { Component, ElementRef, Injector, inject, signal } from '@angular/core';
import { FormField, email, form, required } from '@angular/forms/signals';
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
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { CreateInvitationRequest, ROLES, Role } from '../../../core/api/api.models';
import { ErrorMessages } from '../../../core/errors/error-messages';
import { FieldError } from '../../../shared/forms/field-error';
import { submitWithApi } from '../../../shared/forms/form-helpers';

export interface InviteDialogData {
  /** Creates the invitation; rejects with an ApiError the dialog shows next to its fields. */
  invite: (request: CreateInvitationRequest) => Promise<unknown>;
}

/** Invite someone by email, choosing their role with a one-line hint for each. */
@Component({
  selector: 'kora-invite-dialog',
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
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'admin.invitations.dialogTitle' | transloco }}</h2>
    <form class="kora-form" novalidate (submit)="invite($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'auth.email' | transloco }}</mat-label>
          <input matInput type="email" autocomplete="off" [formField]="form.email" />
          <mat-error><kora-field-error [field]="form.email" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'admin.members.role' | transloco }}</mat-label>
          <mat-select [formField]="form.role">
            @for (role of roles; track role) {
              <mat-option [value]="role">{{ 'roles.' + role | transloco }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ 'roleHints.' + model().role | transloco }}</mat-hint>
          <mat-error><kora-field-error [field]="form.role" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'admin.invitations.dialogSubmit' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(400px, calc(100vw - 96px));
    }
    mat-form-field {
      inline-size: 100%;
    }
  `,
})
export class InviteDialog {
  private readonly data = inject<InviteDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<InviteDialog, boolean>);

  protected readonly roles = ROLES;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<{ email: string; role: Role }>({ email: '', role: 'MEMBER' });
  protected readonly form = form(this.model, (path) => {
    required(path.email);
    email(path.email);
    required(path.role);
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async invite(event: Event): Promise<void> {
    event.preventDefault();
    const request = { email: this.model().email.trim(), role: this.model().role };
    if (await submitWithApi(this.form, this.context, () => this.data.invite(request))) {
      this.dialogRef.close(true);
    }
  }
}
