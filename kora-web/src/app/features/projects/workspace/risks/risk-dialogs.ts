import {
  Component,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
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
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AssessRiskRequest,
  CreateRiskRequest,
  ISSUE_PRIORITIES,
  Issue,
  IssuePriority,
  MaterializeRiskRequest,
  ProjectMember,
  RESPONSE_STRATEGIES,
  RISK_CATEGORIES,
  RISK_KINDS,
  RISK_PROXIMITIES,
  RISK_STATUSES_NEEDING_RESPONSE,
  ResponseStrategy,
  Risk,
  RiskAssessment,
  RiskCategory,
  RiskKind,
  RiskProximity,
  RiskStatus,
  UpdateRiskRequest,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { SeverityChip } from '../governance-look';
import { severityOf } from './risk-scoring';

const LEVELS = [1, 2, 3, 4, 5] as const;
const EDITABLE_STATUSES = [
  'IDENTIFIED',
  'ANALYZED',
  'RESPONSE_PLANNED',
  'MONITORING',
] as const satisfies readonly RiskStatus[];

const FORM_IMPORTS = [
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
];

/** Form-level error region, focus on the first invalid field — what every dialog here needs. */
function apiContext(formError: ReturnType<typeof signal<string | null>>) {
  return {
    messages: inject(ErrorMessages),
    formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };
}

export interface RiskDialogData {
  /** The risk to edit; absent to raise one. */
  risk?: Risk;
  members: readonly ProjectMember[];
  save: (request: CreateRiskRequest & UpdateRiskRequest) => Promise<Risk>;
}

interface RiskForm {
  title: string;
  description: string;
  kind: RiskKind;
  category: RiskCategory;
  proximity: RiskProximity | '';
  probability: number;
  impact: number;
  ownerId: string;
  status: RiskStatus;
  responseStrategy: ResponseStrategy | '';
  responsePlan: string;
  triggerConditions: string;
  reviewDate: string;
}

/**
 * Raises or edits a risk (feature 11): guided scoring (what each probability and impact level
 * means), strategies that depend on threat or opportunity, and a response plan once the status
 * says one exists. An existing risk is re-scored through an assessment, not here.
 */
@Component({
  selector: 'kora-risk-dialog',
  imports: [...FORM_IMPORTS, MatHint, SeverityChip],
  template: `
    <h2 mat-dialog-title>
      @if (data.risk; as risk) {
        {{ 'risks.editTitle' | transloco: { key: risk.key } }}
      } @else {
        {{ 'risks.raiseTitle' | transloco }}
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
          <mat-label>{{ 'risks.fields.title' | transloco }}</mat-label>
          <input matInput [formField]="form.title" />
          <mat-error><kora-field-error [field]="form.title" /></mat-error>
        </mat-form-field>
        <div class="row">
          @if (!data.risk) {
            <mat-form-field>
              <mat-label>{{ 'risks.fields.kind' | transloco }}</mat-label>
              <mat-select [formField]="form.kind">
                <mat-select-trigger>{{
                  'riskKind.' + model().kind | transloco
                }}</mat-select-trigger>
                @for (value of kinds; track value) {
                  <mat-option [value]="value">{{ 'riskKind.' + value | transloco }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'riskKindHint.' + model().kind | transloco }}</mat-hint>
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>{{ 'risks.fields.category' | transloco }}</mat-label>
            <mat-select [formField]="form.category">
              <mat-select-trigger>{{
                'riskCategory.' + model().category | transloco
              }}</mat-select-trigger>
              @for (value of categories; track value) {
                <mat-option [value]="value">{{ 'riskCategory.' + value | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'risks.fields.proximity' | transloco }}</mat-label>
            <mat-select [formField]="form.proximity">
              <mat-option value="">{{ 'common.notSet' | transloco }}</mat-option>
              @for (value of proximities; track value) {
                <mat-option [value]="value">{{ 'riskProximity.' + value | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        @if (!data.risk) {
          <fieldset class="scoring">
            <legend>{{ 'risks.scoring' | transloco }}</legend>
            <div class="row">
              <mat-form-field>
                <mat-label>{{ 'risks.fields.probability' | transloco }}</mat-label>
                <mat-select [formField]="form.probability">
                  <mat-select-trigger>{{
                    'riskProbability.' + model().probability | transloco
                  }}</mat-select-trigger>
                  @for (value of levels; track value) {
                    <mat-option [value]="value">{{
                      'riskProbability.' + value | transloco
                    }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'risks.fields.impact' | transloco }}</mat-label>
                <mat-select [formField]="form.impact">
                  <mat-select-trigger>{{
                    'riskImpact.' + model().impact | transloco
                  }}</mat-select-trigger>
                  @for (value of levels; track value) {
                    <mat-option [value]="value">{{ 'riskImpact.' + value | transloco }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <p class="score" aria-live="polite">
              {{ 'risks.fields.score' | transloco }}:
              <kora-severity-chip [severity]="severity()" [score]="score()" />
            </p>
          </fieldset>
        }

        <mat-form-field>
          <mat-label>{{ 'risks.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="3" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'risks.fields.owner' | transloco }}</mat-label>
            <mat-select [formField]="form.ownerId">
              <mat-option value="">{{ 'risks.noOwner' | transloco }}</mat-option>
              @for (person of data.members; track person.userId) {
                <mat-option [value]="person.userId">{{ person.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'risks.fields.reviewDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.reviewDate" />
          </mat-form-field>
          @if (data.risk) {
            <mat-form-field>
              <mat-label>{{ 'risks.fields.status' | transloco }}</mat-label>
              <mat-select [formField]="form.status">
                <mat-select-trigger>{{
                  'riskStatus.' + model().status | transloco
                }}</mat-select-trigger>
                @for (value of statuses; track value) {
                  <mat-option [value]="value">{{ 'riskStatus.' + value | transloco }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>

        <fieldset class="scoring">
          <legend>{{ 'risks.response' | transloco }}</legend>
          <mat-form-field>
            <mat-label>{{ 'risks.fields.strategy' | transloco }}</mat-label>
            <mat-select [formField]="form.responseStrategy">
              <mat-option value="">{{ 'common.notSet' | transloco }}</mat-option>
              @for (value of strategies(); track value) {
                <mat-option [value]="value">
                  {{ 'responseStrategy.' + value | transloco }}
                  <span class="kora-muted"
                    >— {{ 'responseStrategyHint.' + value | transloco }}</span
                  >
                </mat-option>
              }
            </mat-select>
            <mat-error><kora-field-error [field]="form.responseStrategy" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'risks.fields.plan' | transloco }}</mat-label>
            <textarea matInput rows="3" [formField]="form.responsePlan"></textarea>
            <mat-hint>{{ 'risks.hints.plan' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.responsePlan" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'risks.fields.triggers' | transloco }}</mat-label>
            <input matInput [formField]="form.triggerConditions" />
            <mat-error><kora-field-error [field]="form.triggerConditions" /></mat-error>
          </mat-form-field>
        </fieldset>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.risk ? 'common.save' : 'risks.raise') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styleUrl: './risk-dialogs.scss',
})
export class RiskDialog {
  protected readonly data = inject<RiskDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RiskDialog, Risk>);

  protected readonly kinds = RISK_KINDS;
  protected readonly categories = RISK_CATEGORIES;
  protected readonly proximities = RISK_PROXIMITIES;
  protected readonly statuses = EDITABLE_STATUSES;
  protected readonly levels = LEVELS;

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<RiskForm>(this.initial());
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 200);
    maxLength(path.description, 4000);
    maxLength(path.responsePlan, 4000);
    maxLength(path.triggerConditions, 2000);
    validate(path.responseStrategy, ({ value, valueOf }) =>
      RISK_STATUSES_NEEDING_RESPONSE.includes(valueOf(path.status)) && !value()
        ? { kind: I18N_ERROR, message: 'risks.errors.strategyNeeded' }
        : undefined,
    );
    validate(path.responsePlan, ({ value, valueOf }) =>
      RISK_STATUSES_NEEDING_RESPONSE.includes(valueOf(path.status)) && !value().trim()
        ? { kind: I18N_ERROR, message: 'risks.errors.planNeeded' }
        : undefined,
    );
  });
  private readonly context = apiContext(this.formError);

  protected readonly score = computed(() => this.model().probability * this.model().impact);
  protected readonly severity = computed(() => severityOf(this.score()));
  /** A threat's strategies differ from an opportunity's; switching kind clears a mismatch. */
  protected readonly strategies = computed(() => RESPONSE_STRATEGIES[this.model().kind]);

  constructor() {
    // Switching between threat and opportunity clears a strategy the new kind doesn't have.
    effect(() => {
      const { kind, responseStrategy } = this.model();
      if (responseStrategy && !RESPONSE_STRATEGIES[kind].includes(responseStrategy)) {
        untracked(() => this.model.update((m) => ({ ...m, responseStrategy: '' })));
      }
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    let saved: Risk | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(this.request());
    });
    if (ok && saved) this.dialogRef.close(saved);
  }

  private request(): CreateRiskRequest & UpdateRiskRequest {
    const m = this.model();
    const existing = this.data.risk;
    const common = {
      title: m.title.trim(),
      description: m.description,
      category: m.category,
      ...(m.proximity ? { proximity: m.proximity } : {}),
      ...(m.ownerId ? { ownerId: m.ownerId } : {}),
      ...(m.responseStrategy ? { responseStrategy: m.responseStrategy } : {}),
      responsePlan: m.responsePlan,
      triggerConditions: m.triggerConditions,
      ...(m.reviewDate ? { reviewDate: m.reviewDate } : {}),
    };
    if (existing) {
      return { ...common, status: m.status } as CreateRiskRequest & UpdateRiskRequest;
    }
    return { ...common, kind: m.kind, probability: m.probability, impact: m.impact };
  }

  private initial(): RiskForm {
    const risk = this.data.risk;
    return {
      title: risk?.title ?? '',
      description: risk?.description ?? '',
      kind: risk?.kind ?? 'THREAT',
      category: risk?.category ?? 'TECHNICAL',
      proximity: risk?.proximity ?? '',
      probability: risk?.probability ?? 3,
      impact: risk?.impact ?? 3,
      ownerId: risk?.ownerId ?? '',
      status: risk?.status === 'CLOSED' ? 'MONITORING' : (risk?.status ?? 'IDENTIFIED'),
      responseStrategy: risk?.responseStrategy ?? '',
      responsePlan: risk?.responsePlan ?? '',
      triggerConditions: risk?.triggerConditions ?? '',
      reviewDate: risk?.reviewDate ?? '',
    };
  }
}

export interface AssessDialogData {
  risk: Risk;
  save: (request: AssessRiskRequest) => Promise<RiskAssessment>;
}

/** Re-scores a risk: inherent probability and impact, the residual expected after the response, a note. */
@Component({
  selector: 'kora-assess-dialog',
  imports: [...FORM_IMPORTS, SeverityChip],
  template: `
    <h2 mat-dialog-title>{{ 'risks.assessTitle' | transloco: { key: data.risk.key } }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <p class="kora-muted">
          {{ 'risks.currentScore' | transloco }}:
          <kora-severity-chip [severity]="data.risk.severity" [score]="data.risk.score" />
        </p>
        <fieldset class="scoring">
          <legend>{{ 'risks.inherent' | transloco }}</legend>
          <div class="row">
            <mat-form-field>
              <mat-label>{{ 'risks.fields.probability' | transloco }}</mat-label>
              <mat-select [formField]="form.probability">
                <mat-select-trigger>{{
                  'riskProbability.' + model().probability | transloco
                }}</mat-select-trigger>
                @for (value of levels; track value) {
                  <mat-option [value]="value">{{
                    'riskProbability.' + value | transloco
                  }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'risks.fields.impact' | transloco }}</mat-label>
              <mat-select [formField]="form.impact">
                <mat-select-trigger>{{
                  'riskImpact.' + model().impact | transloco
                }}</mat-select-trigger>
                @for (value of levels; track value) {
                  <mat-option [value]="value">{{ 'riskImpact.' + value | transloco }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <p class="score" aria-live="polite">
            {{ 'risks.newScore' | transloco }}:
            <kora-severity-chip [severity]="severity()" [score]="score()" />
          </p>
        </fieldset>
        <fieldset class="scoring">
          <legend>{{ 'risks.residual' | transloco }}</legend>
          <p class="kora-muted hint">{{ 'risks.hints.residual' | transloco }}</p>
          <div class="row">
            <mat-form-field>
              <mat-label>{{ 'risks.fields.residualProbability' | transloco }}</mat-label>
              <mat-select [formField]="form.residualProbability">
                <mat-option [value]="0">{{ 'common.notSet' | transloco }}</mat-option>
                @for (value of levels; track value) {
                  <mat-option [value]="value">{{
                    'riskProbability.' + value | transloco
                  }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'risks.fields.residualImpact' | transloco }}</mat-label>
              <mat-select [formField]="form.residualImpact">
                <mat-option [value]="0">{{ 'common.notSet' | transloco }}</mat-option>
                @for (value of levels; track value) {
                  <mat-option [value]="value">{{ 'riskImpact.' + value | transloco }}</mat-option>
                }
              </mat-select>
              <mat-error><kora-field-error [field]="form.residualImpact" /></mat-error>
            </mat-form-field>
          </div>
        </fieldset>
        <mat-form-field>
          <mat-label>{{ 'risks.fields.note' | transloco }}</mat-label>
          <input matInput [formField]="form.note" />
          <mat-error><kora-field-error [field]="form.note" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'risks.assess' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styleUrl: './risk-dialogs.scss',
})
export class AssessDialog {
  protected readonly data = inject<AssessDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<AssessDialog, RiskAssessment>);
  protected readonly levels = LEVELS;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    probability: this.data.risk.probability,
    impact: this.data.risk.impact,
    residualProbability: this.data.risk.residualProbability ?? 0,
    residualImpact: this.data.risk.residualImpact ?? 0,
    note: '',
  });
  protected readonly form = form(this.model, (path) => {
    maxLength(path.note, 1000);
    // Residual scores go together: one without the other can't be scored.
    validate(path.residualImpact, ({ value, valueOf }) =>
      !value() !== !valueOf(path.residualProbability)
        ? { kind: I18N_ERROR, message: 'risks.errors.residualPair' }
        : undefined,
    );
  });
  private readonly context = apiContext(this.formError);
  protected readonly score = computed(() => this.model().probability * this.model().impact);
  protected readonly severity = computed(() => severityOf(this.score()));

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.model();
    const request: AssessRiskRequest = {
      probability: m.probability,
      impact: m.impact,
      ...(m.residualProbability ? { residualProbability: m.residualProbability } : {}),
      ...(m.residualImpact ? { residualImpact: m.residualImpact } : {}),
      ...(m.note.trim() ? { note: m.note.trim() } : {}),
    };
    let saved: RiskAssessment | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(request);
    });
    if (ok && saved) this.dialogRef.close(saved);
  }
}

export interface MaterializeDialogData {
  risk: Risk;
  members: readonly ProjectMember[];
  save: (request: MaterializeRiskRequest) => Promise<Issue>;
}

/** "It happened": opens the issue that tracks it and closes the risk, in one step. */
@Component({
  selector: 'kora-materialize-dialog',
  imports: FORM_IMPORTS,
  template: `
    <h2 mat-dialog-title>{{ 'risks.materializeTitle' | transloco: { key: data.risk.key } }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        <p>{{ 'risks.materializeIntro' | transloco }}</p>
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
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'risks.materialize' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styleUrl: './risk-dialogs.scss',
})
export class MaterializeDialog {
  protected readonly data = inject<MaterializeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<MaterializeDialog, Issue>);
  protected readonly priorities = ISSUE_PRIORITIES;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({
    title: this.data.risk.title,
    priority: this.data.risk.severity as IssuePriority,
    ownerId: this.data.risk.ownerId ?? '',
    dueDate: '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 200);
  });
  private readonly context = apiContext(this.formError);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.model();
    const request: MaterializeRiskRequest = {
      title: m.title.trim(),
      priority: m.priority,
      ...(m.ownerId ? { ownerId: m.ownerId } : {}),
      ...(m.dueDate ? { dueDate: m.dueDate } : {}),
    };
    let issue: Issue | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      issue = await this.data.save(request);
    });
    if (ok && issue) this.dialogRef.close(issue);
  }
}
