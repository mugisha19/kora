import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, minLength, required } from '@angular/forms/signals';
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
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Program, ProgramStatus } from '../../core/api/api.models';
import { ErrorMessages } from '../../core/errors/error-messages';
import { OrgDirectory } from '../../core/people/org-directory';
import { MANAGER_ROLES } from '../../core/auth/permissions';
import { FieldError } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';

export interface ProgramRequest {
  name: string;
  description: string;
  managerId: string;
  status?: ProgramStatus;
}

export interface ProgramDialogData {
  /** The program being edited; omitted to create one. */
  program?: Program;
  save: (request: ProgramRequest) => Promise<Program>;
}

/** Create or edit a program: name, description, manager and (when editing) active or closed. */
@Component({
  selector: 'kora-program-dialog',
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
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.program ? 'programs.editTitle' : 'programs.createTitle') | transloco }}
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
          <mat-label>{{ 'programs.fields.name' | transloco }}</mat-label>
          <input matInput [formField]="form.name" />
          <mat-error><kora-field-error [field]="form.name" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'programs.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="2" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'programs.fields.manager' | transloco }}</mat-label>
          <mat-select [formField]="form.managerId">
            @for (person of managers(); track person.userId) {
              <mat-option [value]="person.userId">
                {{ person.fullName }} · {{ 'roles.' + person.role | transloco }}
              </mat-option>
            }
          </mat-select>
          <mat-error><kora-field-error [field]="form.managerId" /></mat-error>
        </mat-form-field>
        @if (data.program) {
          <mat-form-field>
            <mat-label>{{ 'programs.fields.status' | transloco }}</mat-label>
            <mat-select [formField]="form.status">
              <mat-option value="ACTIVE">{{ 'programStatus.ACTIVE' | transloco }}</mat-option>
              <mat-option value="CLOSED">{{ 'programStatus.CLOSED' | transloco }}</mat-option>
            </mat-select>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.program ? 'common.save' : 'programs.create') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
  `,
})
export class ProgramDialog {
  protected readonly data = inject<ProgramDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ProgramDialog, Program>);
  private readonly directory = inject(OrgDirectory);

  protected readonly managers = computed(() => this.directory.peopleWith(MANAGER_ROLES));

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<Required<ProgramRequest>>({
    name: this.data.program?.name ?? '',
    description: this.data.program?.description ?? '',
    managerId: this.data.program?.manager.userId ?? '',
    status: this.data.program?.status ?? 'ACTIVE',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    minLength(path.name, 2);
    maxLength(path.name, 100);
    maxLength(path.description, 2000);
    required(path.managerId);
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const { name, description, managerId, status } = this.model();
    const request: ProgramRequest = {
      name: name.trim(),
      description: description.trim(),
      managerId,
      ...(this.data.program ? { status } : {}),
    };
    let saved: Program | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(request);
    });
    if (ok) this.dialogRef.close(saved);
  }
}
