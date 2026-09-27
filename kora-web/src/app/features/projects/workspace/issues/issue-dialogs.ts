import { Component, ElementRef, Injector, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
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
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CreateIssueRequest,
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  Issue,
  IssuePriority,
  IssueType,
  ProjectMember,
  UpdateIssueRequest,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';

export interface IssueDialogData {
  /** The issue to edit; absent to raise one. */
  issue?: Issue;
  members: readonly ProjectMember[];
  save: (body: CreateIssueRequest & UpdateIssueRequest) => Promise<Issue>;
}

/** Raises or edits an issue (feature 12): what is wrong, how urgent, who resolves it, by when. */
@Component({
  selector: 'kora-issue-dialog',
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
    MatSelectTrigger,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      @if (data.issue; as issue) {
        {{ 'issues.editTitle' | transloco: { key: issue.key } }}
      } @else {
        {{ 'issues.raiseTitle' | transloco }}
      }
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
          <mat-label>{{ 'issues.fields.title' | transloco }}</mat-label>
          <input matInput [formField]="form.title" />
          <mat-error><kora-field-error [field]="form.title" /></mat-error>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'issues.fields.type' | transloco }}</mat-label>
            <mat-select [formField]="form.type">
              <mat-select-trigger>{{ 'issueType.' + model().type | transloco }}</mat-select-trigger>
              @for (value of types; track value) {
                <mat-option [value]="value">{{ 'issueType.' + value | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'issues.fields.priority' | transloco }}</mat-label>
            <mat-select [formField]="form.priority">
              <mat-select-trigger>{{
                'taskPriority.' + model().priority | transloco
              }}</mat-select-trigger>
              @for (value of priorities; track value) {
                <mat-option [value]="value">{{ 'taskPriority.' + value | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'issues.fields.owner' | transloco }}</mat-label>
            <mat-select [formField]="form.ownerId">
              <mat-option value="">{{ 'risks.noOwner' | transloco }}</mat-option>
              @for (person of data.members; track person.userId) {
                <mat-option [value]="person.userId">{{ person.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'issues.fields.dueDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.dueDate" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'issues.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="4" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.issue ? 'common.save' : 'issues.raise') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(480px, calc(100vw - 96px));
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0 var(--kora-space-3);
    }
  `,
})
export class IssueDialog {
  protected readonly data = inject<IssueDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<IssueDialog, Issue>);
  protected readonly types = ISSUE_TYPES;
  protected readonly priorities = ISSUE_PRIORITIES;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    title: this.data.issue?.title ?? '',
    type: (this.data.issue?.type ?? 'TECHNICAL') as IssueType,
    priority: (this.data.issue?.priority ?? 'MEDIUM') as IssuePriority,
    ownerId: this.data.issue?.owner?.userId ?? '',
    dueDate: this.data.issue?.dueDate ?? '',
    description: this.data.issue?.description ?? '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 200);
    maxLength(path.description, 4000);
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
    const body: CreateIssueRequest & UpdateIssueRequest = {
      title: m.title.trim(),
      type: m.type,
      priority: m.priority,
      description: m.description,
      ...(m.ownerId ? { ownerId: m.ownerId } : {}),
      ...(m.dueDate ? { dueDate: m.dueDate } : {}),
    };
    let saved: Issue | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(body);
    });
    if (ok && saved) this.dialogRef.close(saved);
  }
}
