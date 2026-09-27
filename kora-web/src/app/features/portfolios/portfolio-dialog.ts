import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, minLength, required, validate } from '@angular/forms/signals';
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
import { CreatePortfolioRequest, Portfolio } from '../../core/api/api.models';
import { ErrorMessages } from '../../core/errors/error-messages';
import { OrgDirectory } from '../../core/people/org-directory';
import { SessionStore } from '../../core/session/session.store';
import { FieldError, I18N_ERROR } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { linesToList } from '../../shared/forms/text-list';

export interface PortfolioDialogData {
  /** The portfolio being edited; omitted to create one. */
  portfolio?: Portfolio;
  /** Saves; rejects with an ApiError the dialog shows next to its fields. */
  save: (request: CreatePortfolioRequest) => Promise<Portfolio>;
}

interface PortfolioForm {
  name: string;
  description: string;
  /** One strategic objective per line. */
  objectives: string;
  ownerId: string;
}

/** Create or edit a portfolio: name, description, strategic objectives and owner (PMO or admin). */
@Component({
  selector: 'kora-portfolio-dialog',
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
    <h2 mat-dialog-title>
      {{ (data.portfolio ? 'portfolios.editTitle' : 'portfolios.createTitle') | transloco }}
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
          <mat-label>{{ 'portfolios.fields.name' | transloco }}</mat-label>
          <input matInput [formField]="form.name" />
          <mat-error><kora-field-error [field]="form.name" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'portfolios.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="2" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'portfolios.fields.objectives' | transloco }}</mat-label>
          <textarea matInput rows="4" [formField]="form.objectives"></textarea>
          <mat-hint>{{ 'common.onePerLine' | transloco }}</mat-hint>
          <mat-error><kora-field-error [field]="form.objectives" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'portfolios.fields.owner' | transloco }}</mat-label>
          <mat-select [formField]="form.ownerId">
            @for (person of owners(); track person.userId) {
              <mat-option [value]="person.userId">
                {{ person.fullName }} · {{ 'roles.' + person.role | transloco }}
              </mat-option>
            }
          </mat-select>
          <mat-error><kora-field-error [field]="form.ownerId" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.portfolio ? 'common.save' : 'portfolios.create') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(480px, calc(100vw - 96px));
    }
  `,
})
export class PortfolioDialog {
  protected readonly data = inject<PortfolioDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PortfolioDialog, Portfolio>);
  private readonly directory = inject(OrgDirectory);
  private readonly session = inject(SessionStore);

  /** Owners must be PMO or admins; the current owner stays listed even if their role changed. */
  protected readonly owners = computed(() => {
    const eligible = this.directory.peopleWith(['PMO', 'ORG_ADMIN']);
    const owner = this.data.portfolio?.owner;
    return owner && !eligible.some((p) => p.userId === owner.userId)
      ? [{ userId: owner.userId, fullName: owner.fullName, role: 'MEMBER' as const }, ...eligible]
      : eligible;
  });

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<PortfolioForm>({
    name: this.data.portfolio?.name ?? '',
    description: this.data.portfolio?.description ?? '',
    objectives: this.data.portfolio?.strategicObjectives.join('\n') ?? '',
    ownerId: this.data.portfolio?.owner.userId ?? this.session.user()?.id ?? '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    minLength(path.name, 2);
    maxLength(path.name, 100);
    maxLength(path.description, 2000);
    required(path.ownerId);
    validate(path.objectives, ({ value }) => {
      const lines = linesToList(value());
      if (lines.length > 50) return { kind: I18N_ERROR, message: 'errors.fields.tooManyLines' };
      if (lines.some((line) => line.length > 500)) {
        return { kind: I18N_ERROR, message: 'errors.fields.lineTooLong' };
      }
      return undefined;
    });
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const value = this.model();
    const request: CreatePortfolioRequest = {
      name: value.name.trim(),
      description: value.description.trim(),
      strategicObjectives: linesToList(value.objectives),
      ownerId: value.ownerId,
    };
    let saved: Portfolio | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(request);
    });
    if (ok) this.dialogRef.close(saved);
  }
}
