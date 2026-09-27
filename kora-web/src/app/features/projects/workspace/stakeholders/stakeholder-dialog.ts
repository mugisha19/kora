import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, email, form, maxLength, required, validate } from '@angular/forms/signals';
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
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CreateStakeholderRequest,
  ENGAGEMENTS,
  Engagement,
  Stakeholder,
  UpdateStakeholderRequest,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { quadrantOf } from './stakeholder-look';

export interface StakeholderDialogData {
  /** The stakeholder to show or edit; absent to add one. */
  stakeholder?: Stakeholder;
  /** Managers edit; everyone else reads. */
  canEdit: boolean;
  save: (body: CreateStakeholderRequest & UpdateStakeholderRequest) => Promise<Stakeholder>;
  remove?: (stakeholder: Stakeholder) => Promise<boolean>;
}

const LEVELS = [1, 2, 3, 4, 5] as const;
const PHONE = /^[+0-9 ()-]{3,40}$/;

/**
 * A stakeholder (feature 13): who they are, how to reach them (personal data, kept to a minimum),
 * power, interest and influence, and current versus desired engagement. Managers edit and remove
 * (removal erases the personal data); everyone else reads.
 */
@Component({
  selector: 'kora-stakeholder-dialog',
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
    TranslocoPipe,
  ],
  templateUrl: './stakeholder-dialog.html',
  styles: `
    mat-dialog-content {
      min-inline-size: min(520px, calc(100vw - 96px));
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0 var(--kora-space-3);
    }
    .quadrant {
      margin: 0 0 var(--kora-space-3);
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: var(--kora-space-3);
      margin: 0;
    }
    .facts dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .facts dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .danger {
      margin-inline-end: auto;
    }
  `,
})
export class StakeholderDialog {
  protected readonly data = inject<StakeholderDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<StakeholderDialog, Stakeholder | 'removed'>);
  protected readonly levels = LEVELS;
  protected readonly engagements = ENGAGEMENTS;
  protected readonly editing = this.data.canEdit;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal(this.initial());
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 200);
    maxLength(path.organization, 200);
    maxLength(path.role, 200);
    email(path.email);
    maxLength(path.email, 254);
    validate(path.phone, ({ value }) =>
      value().trim() && !PHONE.test(value().trim())
        ? { kind: I18N_ERROR, message: 'stakeholders.errors.phone' }
        : undefined,
    );
    maxLength(path.communicationPreferences, 1000);
    maxLength(path.notes, 4000);
  });
  protected readonly quadrant = computed(() =>
    quadrantOf(this.model().power, this.model().interest),
  );
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.model();
    const body: CreateStakeholderRequest & UpdateStakeholderRequest = {
      name: m.name.trim(),
      organization: m.organization.trim(),
      role: m.role.trim(),
      ...(m.email.trim() || this.data.stakeholder?.email ? { email: m.email.trim() } : {}),
      ...(m.phone.trim() || this.data.stakeholder?.phone ? { phone: m.phone.trim() } : {}),
      power: m.power,
      interest: m.interest,
      influence: m.influence,
      currentEngagement: m.currentEngagement,
      desiredEngagement: m.desiredEngagement,
      communicationPreferences: m.communicationPreferences,
      notes: m.notes,
    };
    let saved: Stakeholder | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(body);
    });
    if (ok && saved) this.dialogRef.close(saved);
  }

  protected async remove(): Promise<void> {
    const stakeholder = this.data.stakeholder;
    if (stakeholder && this.data.remove && (await this.data.remove(stakeholder))) {
      this.dialogRef.close('removed');
    }
  }

  private initial() {
    const s = this.data.stakeholder;
    return {
      name: s?.name ?? '',
      organization: s?.organization ?? '',
      role: s?.role ?? '',
      email: s?.email ?? '',
      phone: s?.phone ?? '',
      power: s?.power ?? 3,
      interest: s?.interest ?? 3,
      influence: s?.influence ?? 3,
      currentEngagement: (s?.currentEngagement ?? 'NEUTRAL') as Engagement,
      desiredEngagement: (s?.desiredEngagement ?? 'SUPPORTIVE') as Engagement,
      communicationPreferences: s?.communicationPreferences ?? '',
      notes: s?.notes ?? '',
    };
  }
}
