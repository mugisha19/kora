import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
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
  CHANGE_REQUEST_TYPES,
  ChangeImpact,
  ChangeRequest,
  ChangeRequestType,
  CreateChangeRequestRequest,
  Decision,
  DecisionRequest,
  UpdateChangeRequestRequest,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { parseAmount } from '../../../../shared/format/money';

/** A signed amount: "-1 500 000" is a saving. Null when it isn't an amount. */
export function parseSignedAmount(text: string, currency: string): string | null {
  const trimmed = text.trim();
  const negative = /^[-−]/.test(trimmed);
  const amount = parseAmount(trimmed.replace(/^[-−+]/, ''), currency);
  if (amount === null) return null;
  return negative && amount !== '0' ? `-${amount}` : amount;
}

export interface ChangeRequestDialogData {
  /** The draft to edit; absent to draft a new request. */
  request?: ChangeRequest;
  /** The issue it deals with, when drafted from one. */
  issueKey?: string;
  currency: string;
  save: (body: CreateChangeRequestRequest & UpdateChangeRequestRequest) => Promise<ChangeRequest>;
}

interface ChangeForm {
  title: string;
  type: ChangeRequestType;
  reason: string;
  description: string;
  costDelta: string;
  scheduleDeltaDays: string;
  scopeSummary: string;
  riskSummary: string;
  changesCharterScope: boolean;
}

/**
 * Drafts or edits a change request (feature 14) with its impact analysis: cost (negative for a
 * saving), schedule in working days, scope and risk, and whether the charter's scope changes. Who
 * must approve is decided by the API when it is submitted.
 */
@Component({
  selector: 'kora-change-request-dialog',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatCheckbox,
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
    <h2 mat-dialog-title>
      @if (data.request; as request) {
        {{ 'changes.editTitle' | transloco: { key: request.key } }}
      } @else {
        {{ 'changes.draftTitle' | transloco }}
      }
    </h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (data.issueKey) {
          <p class="kora-muted">{{ 'changes.fromIssue' | transloco: { key: data.issueKey } }}</p>
        }
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'changes.fields.title' | transloco }}</mat-label>
          <input matInput [formField]="form.title" />
          <mat-error><kora-field-error [field]="form.title" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'changes.fields.type' | transloco }}</mat-label>
          <mat-select [formField]="form.type">
            <mat-select-trigger>{{ 'changeType.' + model().type | transloco }}</mat-select-trigger>
            @for (value of types; track value) {
              <mat-option [value]="value">{{ 'changeType.' + value | transloco }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'changes.fields.reason' | transloco }}</mat-label>
          <textarea matInput rows="2" [formField]="form.reason"></textarea>
          <mat-hint>{{ 'changes.hints.reason' | transloco }}</mat-hint>
          <mat-error><kora-field-error [field]="form.reason" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'changes.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="3" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>

        <fieldset class="impact">
          <legend>{{ 'changes.impact' | transloco }}</legend>
          <div class="row">
            <mat-form-field>
              <mat-label>{{ 'changes.fields.cost' | transloco }}</mat-label>
              <input matInput inputmode="decimal" [formField]="form.costDelta" />
              <span matTextSuffix>{{ data.currency }}</span>
              <mat-hint>{{ 'changes.hints.cost' | transloco }}</mat-hint>
              <mat-error><kora-field-error [field]="form.costDelta" /></mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'changes.fields.schedule' | transloco }}</mat-label>
              <input matInput inputmode="numeric" [formField]="form.scheduleDeltaDays" />
              <span matTextSuffix>{{ 'schedule.daysSuffix' | transloco }}</span>
              <mat-hint>{{ 'changes.hints.schedule' | transloco }}</mat-hint>
              <mat-error><kora-field-error [field]="form.scheduleDeltaDays" /></mat-error>
            </mat-form-field>
          </div>
          <mat-form-field>
            <mat-label>{{ 'changes.fields.scope' | transloco }}</mat-label>
            <textarea matInput rows="2" [formField]="form.scopeSummary"></textarea>
            <mat-error><kora-field-error [field]="form.scopeSummary" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'changes.fields.risk' | transloco }}</mat-label>
            <textarea matInput rows="2" [formField]="form.riskSummary"></textarea>
            <mat-error><kora-field-error [field]="form.riskSummary" /></mat-error>
          </mat-form-field>
          <mat-checkbox
            [checked]="model().changesCharterScope"
            (change)="setCharterScope($event.checked)"
          >
            {{ 'changes.fields.charterScope' | transloco }}
          </mat-checkbox>
          <p class="kora-muted hint">{{ 'changes.hints.charterScope' | transloco }}</p>
          @if (charterScopeError()) {
            <p class="error" role="alert">{{ 'changes.errors.scopeNeeded' | transloco }}</p>
          }
        </fieldset>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.request ? 'common.save' : 'changes.saveDraft') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(520px, calc(100vw - 96px));
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0 var(--kora-space-3);
    }
    .impact {
      margin: 0 0 var(--kora-space-3);
      padding: var(--kora-space-2) var(--kora-space-3) var(--kora-space-3);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
    }
    legend {
      padding-inline: var(--kora-space-1);
      font: var(--mat-sys-label-large);
    }
    .hint {
      margin: 0 0 0 var(--kora-space-6);
      font: var(--mat-sys-body-small);
    }
    .error {
      margin: var(--kora-space-2) 0 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ChangeRequestDialog {
  protected readonly data = inject<ChangeRequestDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ChangeRequestDialog, ChangeRequest>);

  protected readonly types = CHANGE_REQUEST_TYPES;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<ChangeForm>(this.initial());
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 200);
    required(path.reason);
    maxLength(path.reason, 2000);
    maxLength(path.description, 4000);
    maxLength(path.scopeSummary, 2000);
    maxLength(path.riskSummary, 2000);
    validate(path.costDelta, ({ value }) =>
      value().trim() && parseSignedAmount(value(), this.data.currency) === null
        ? { kind: I18N_ERROR, message: 'errors.fields.amount' }
        : undefined,
    );
    validate(path.scheduleDeltaDays, ({ value }) => {
      if (!value().trim()) return undefined;
      const days = Number(value().trim().replace('−', '-'));
      return Number.isInteger(days) && days >= -1000 && days <= 1000
        ? undefined
        : { kind: I18N_ERROR, message: 'changes.errors.days' };
    });
  });
  /** Changing the charter's scope needs the scope that is added. */
  protected readonly charterScopeError = computed(
    () => this.tried() && this.model().changesCharterScope && !this.model().scopeSummary.trim(),
  );
  private readonly tried = signal(false);
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected setCharterScope(checked: boolean): void {
    this.model.update((m) => ({ ...m, changesCharterScope: checked }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.tried.set(true);
    if (this.charterScopeError()) return;
    let saved: ChangeRequest | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(this.request());
    });
    if (ok && saved) this.dialogRef.close(saved);
  }

  private request(): CreateChangeRequestRequest & UpdateChangeRequestRequest {
    const m = this.model();
    const cost = m.costDelta.trim() ? parseSignedAmount(m.costDelta, this.data.currency) : null;
    const days = m.scheduleDeltaDays.trim() ? Number(m.scheduleDeltaDays.replace('−', '-')) : null;
    const impact: ChangeImpact = {
      ...(cost !== null ? { costDelta: { amount: cost, currency: this.data.currency } } : {}),
      ...(days !== null ? { scheduleDeltaDays: days } : {}),
      ...(m.scopeSummary.trim() ? { scopeSummary: m.scopeSummary.trim() } : {}),
      ...(m.riskSummary.trim() ? { riskSummary: m.riskSummary.trim() } : {}),
      changesCharterScope: m.changesCharterScope,
    };
    return {
      title: m.title.trim(),
      type: m.type,
      reason: m.reason.trim(),
      description: m.description,
      impact,
    };
  }

  private initial(): ChangeForm {
    const request = this.data.request;
    const impact = request?.impact;
    return {
      title: request?.title ?? '',
      type: request?.type ?? 'SCOPE',
      reason: request?.reason ?? '',
      description: request?.description ?? '',
      costDelta: impact?.costDelta?.amount ?? '',
      scheduleDeltaDays:
        impact?.scheduleDeltaDays === undefined ? '' : String(impact.scheduleDeltaDays),
      scopeSummary: impact?.scopeSummary ?? '',
      riskSummary: impact?.riskSummary ?? '',
      changesCharterScope: impact?.changesCharterScope ?? false,
    };
  }
}

export interface DecisionDialogData {
  request: ChangeRequest;
  decision: Decision;
  /** Why this step is in the chain, for the approver's context. */
  reason: string;
  decide: (body: DecisionRequest) => Promise<ChangeRequest>;
}

/** Approves (comment optional) or rejects (comment required) the step waiting for the caller. */
@Component({
  selector: 'kora-decision-dialog',
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
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        (data.decision === 'APPROVE' ? 'changes.approveTitle' : 'changes.rejectTitle')
          | transloco: { key: data.request.key }
      }}
    </h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        <p>
          <strong>{{ data.request.title }}</strong>
        </p>
        <p class="kora-muted">{{ data.reason }}</p>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>
            {{
              (data.decision === 'REJECT' ? 'changes.rejectComment' : 'changes.approveComment')
                | transloco
            }}
          </mat-label>
          <textarea matInput rows="3" [formField]="form.comment"></textarea>
          <mat-error><kora-field-error [field]="form.comment" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button
          mat-flat-button
          type="submit"
          [class.danger]="data.decision === 'REJECT'"
          [disabled]="form().submitting()"
        >
          <mat-icon
            [svgIcon]="data.decision === 'APPROVE' ? 'thumb_up' : 'thumb_down'"
            aria-hidden="true"
          />
          {{ (data.decision === 'APPROVE' ? 'changes.approve' : 'changes.reject') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
    p {
      margin-block: 0 var(--kora-space-2);
    }
  `,
})
export class DecisionDialog {
  protected readonly data = inject<DecisionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DecisionDialog, ChangeRequest>);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({ comment: '' });
  protected readonly form = form(this.model, (path) => {
    if (this.data.decision === 'REJECT') required(path.comment);
    maxLength(path.comment, 2000);
  });
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const comment = this.model().comment.trim();
    let decided: ChangeRequest | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      decided = await this.data.decide({
        decision: this.data.decision,
        ...(comment ? { comment } : {}),
      });
    });
    if (ok && decided) this.dialogRef.close(decided);
  }
}
