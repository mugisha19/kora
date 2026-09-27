import {
  Component,
  ElementRef,
  Injector,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Health,
  ProjectMember,
  ProjectStatus,
  TRANSITIONS_NEEDING_REASON,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { OrgDirectory } from '../../../../core/people/org-directory';
import { FieldError } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { HEALTH_LOOK } from '../../../../shared/ui/health-chip';

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

function formContext(formError: WritableSignal<string | null>) {
  return {
    messages: inject(ErrorMessages),
    formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };
}

// ---------- Lifecycle transition ----------

export interface TransitionDialogData {
  to: ProjectStatus;
  projectName: string;
  /** Rejects with an ApiError the dialog shows (a missing reason comes back on `reason`). */
  transition: (to: ProjectStatus, reason?: string) => Promise<void>;
}

/** Confirms a lifecycle move; ON_HOLD and CANCELLED need a reason (the API answers 422 without). */
@Component({
  selector: 'kora-transition-dialog',
  imports: [...DIALOG_IMPORTS, MatInput],
  template: `
    <h2 mat-dialog-title>
      {{
        'workspace.lifecycle.dialogTitle'
          | transloco: { status: ('projectStatus.' + data.to | transloco) }
      }}
    </h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <p>
          {{ 'workspace.lifecycle.explain.' + data.to | transloco: { name: data.projectName } }}
        </p>
        <mat-form-field>
          <mat-label>
            {{
              (needsReason ? 'workspace.lifecycle.reason' : 'workspace.lifecycle.reasonOptional')
                | transloco
            }}
          </mat-label>
          <textarea matInput rows="3" [formField]="form.reason"></textarea>
          <mat-error><kora-field-error [field]="form.reason" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{
            'workspace.lifecycle.confirm'
              | transloco: { status: ('projectStatus.' + data.to | transloco) }
          }}
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
export class TransitionDialog {
  protected readonly data = inject<TransitionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TransitionDialog, boolean>);

  protected readonly needsReason = TRANSITIONS_NEEDING_REASON.includes(this.data.to);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({ reason: '' });
  protected readonly form = form(this.model, (path) => {
    if (this.needsReason) required(path.reason);
    maxLength(path.reason, 500);
  });
  private readonly context = formContext(this.formError);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const reason = this.model().reason.trim();
    const ok = await submitWithApi(this.form, this.context, () =>
      this.data.transition(this.data.to, reason || undefined),
    );
    if (ok) this.dialogRef.close(true);
  }
}

// ---------- Health override ----------

export interface HealthDialogData {
  current: Health;
  override: (health: Exclude<Health, 'GREY'>, reason: string) => Promise<void>;
}

/** The manager's judgement wins over the computed health, with a reason everyone can see. */
@Component({
  selector: 'kora-health-dialog',
  imports: [...DIALOG_IMPORTS, MatHint, MatInput, MatRadioButton, MatRadioGroup],
  template: `
    <h2 mat-dialog-title>{{ 'workspace.health.dialogTitle' | transloco }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <p>{{ 'workspace.health.explain' | transloco }}</p>
        <mat-radio-group
          class="healths"
          [formField]="form.health"
          [attr.aria-label]="'projects.fields.health' | transloco"
        >
          @for (value of healths; track value) {
            <mat-radio-button [value]="value">
              <span class="health">
                <mat-icon [svgIcon]="look[value].icon" aria-hidden="true" />
                {{ 'health.' + value | transloco }}
              </span>
            </mat-radio-button>
          }
        </mat-radio-group>
        <mat-form-field>
          <mat-label>{{ 'workspace.health.reason' | transloco }}</mat-label>
          <textarea matInput rows="3" [formField]="form.reason"></textarea>
          <mat-hint>{{ 'workspace.health.reasonHint' | transloco }}</mat-hint>
          <mat-error><kora-field-error [field]="form.reason" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'workspace.health.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
    .healths {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
      margin-block-end: var(--kora-space-4);
    }
    .health {
      display: inline-flex;
      align-items: center;
      gap: var(--kora-space-1);
    }
  `,
})
export class HealthDialog {
  protected readonly data = inject<HealthDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<HealthDialog, boolean>);

  protected readonly healths = ['GREEN', 'AMBER', 'RED'] as const;
  protected readonly look = HEALTH_LOOK;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<{ health: Exclude<Health, 'GREY'>; reason: string }>({
    health: this.data.current === 'GREY' ? 'GREEN' : this.data.current,
    reason: '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.health);
    required(path.reason);
    maxLength(path.reason, 500);
  });
  private readonly context = formContext(this.formError);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const { health, reason } = this.model();
    const ok = await submitWithApi(this.form, this.context, () =>
      this.data.override(health, reason.trim()),
    );
    if (ok) this.dialogRef.close(true);
  }
}

// ---------- Team ----------

export interface MemberDialogData {
  /** People already on the team (not offered again). */
  team: readonly ProjectMember[];
  add: (userId: string, projectRole: 'CONTRIBUTOR' | 'OBSERVER') => Promise<boolean>;
}

/** Adds someone from the organization to the project team as a contributor or observer. */
@Component({
  selector: 'kora-member-dialog',
  imports: [...DIALOG_IMPORTS, MatHint, MatOption, MatSelect],
  template: `
    <h2 mat-dialog-title>{{ 'workspace.team.addTitle' | transloco }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'workspace.team.person' | transloco }}</mat-label>
          <mat-select [formField]="form.userId">
            @for (person of candidates(); track person.userId) {
              <mat-option [value]="person.userId">{{ person.fullName }}</mat-option>
            }
          </mat-select>
          @if (candidates().length === 0) {
            <mat-hint>{{ 'workspace.team.everyoneIn' | transloco }}</mat-hint>
          }
          <mat-error><kora-field-error [field]="form.userId" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'workspace.team.role' | transloco }}</mat-label>
          <mat-select [formField]="form.projectRole">
            <mat-option value="CONTRIBUTOR">{{ 'projectRole.CONTRIBUTOR' | transloco }}</mat-option>
            <mat-option value="OBSERVER">{{ 'projectRole.OBSERVER' | transloco }}</mat-option>
          </mat-select>
          <mat-hint>{{ 'projectRoleHints.' + model().projectRole | transloco }}</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'workspace.team.add' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(400px, calc(100vw - 96px));
    }
  `,
})
export class MemberDialog {
  private readonly data = inject<MemberDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<MemberDialog, boolean>);
  private readonly directory = inject(OrgDirectory);

  protected readonly candidates = computed(() =>
    this.directory.people().filter((p) => !this.data.team.some((m) => m.userId === p.userId)),
  );
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<{ userId: string; projectRole: 'CONTRIBUTOR' | 'OBSERVER' }>({
    userId: '',
    projectRole: 'CONTRIBUTOR',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.userId);
  });
  private readonly context = formContext(this.formError);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const { userId, projectRole } = this.model();
    let added = false;
    await submitWithApi(this.form, this.context, async () => {
      added = await this.data.add(userId, projectRole);
    });
    if (added) this.dialogRef.close(true);
  }
}
