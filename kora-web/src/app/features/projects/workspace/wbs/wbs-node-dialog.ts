import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, disabled, form, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
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
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CreateWbsNodeRequest,
  UpdateWbsNodeRequest,
  WbsNode,
  WbsNodeType,
} from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { OrgDirectory } from '../../../../core/people/org-directory';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { parseAmount } from '../../../../shared/format/money';

export interface WbsNodeDialogData {
  /** Edit this node; otherwise create one under `parent` (or at the top level). */
  node?: WbsNode;
  parent?: WbsNode | null;
  type?: WbsNodeType;
  create: (request: CreateWbsNodeRequest) => Promise<void>;
  update: (node: WbsNode, body: UpdateWbsNodeRequest) => Promise<void>;
}

interface NodeForm {
  name: string;
  description: string;
  type: WbsNodeType;
  ownerId: string;
  effort: string;
  cost: string;
  percent: string;
}

const number = (text: string) => (text.trim() === '' ? null : Number(text.replace(',', '.')));

/**
 * Add or edit a WBS node. Effort, cost and percent complete belong to work packages; a
 * deliverable's are rolled up from its children, so those fields disappear for deliverables. A
 * work package whose progress comes from its tasks shows percent complete read-only.
 */
@Component({
  selector: 'kora-wbs-node-dialog',
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
    MatRadioButton,
    MatRadioGroup,
    MatSelect,
    MatSuffix,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      @if (data.node) {
        {{ 'wbs.dialog.editTitle' | transloco: { code: data.node.code } }}
      } @else if (data.parent) {
        {{ 'wbs.dialog.addUnder' | transloco: { code: data.parent.code, name: data.parent.name } }}
      } @else {
        {{ 'wbs.dialog.addTop' | transloco }}
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
        <fieldset class="types">
          <legend>{{ 'wbs.fields.type' | transloco }}</legend>
          <mat-radio-group [formField]="form.type">
            <mat-radio-button value="DELIVERABLE">{{
              'wbsType.DELIVERABLE' | transloco
            }}</mat-radio-button>
            <mat-radio-button value="WORK_PACKAGE">{{
              'wbsType.WORK_PACKAGE' | transloco
            }}</mat-radio-button>
          </mat-radio-group>
          <p class="kora-muted hint">
            {{
              (typeLocked ? 'wbs.hints.typeLocked' : 'wbs.hints.type.' + model().type) | transloco
            }}
          </p>
        </fieldset>
        <mat-form-field>
          <mat-label>{{ 'wbs.fields.name' | transloco }}</mat-label>
          <input matInput [formField]="form.name" />
          <mat-error><kora-field-error [field]="form.name" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'wbs.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="2" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'wbs.fields.owner' | transloco }}</mat-label>
          <mat-select [formField]="form.ownerId">
            <mat-option value="">{{ 'wbs.noOwner' | transloco }}</mat-option>
            @for (person of people(); track person.userId) {
              <mat-option [value]="person.userId">{{ person.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (model().type === 'WORK_PACKAGE') {
          <div class="row">
            <mat-form-field>
              <mat-label>{{ 'wbs.fields.effort' | transloco }}</mat-label>
              <input matInput inputmode="decimal" [formField]="form.effort" />
              <span matTextSuffix>h</span>
              <mat-error><kora-field-error [field]="form.effort" /></mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'wbs.fields.cost' | transloco }}</mat-label>
              <input matInput inputmode="decimal" [formField]="form.cost" />
              <span matTextSuffix>{{ currency() }}</span>
              <mat-error><kora-field-error [field]="form.cost" /></mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'wbs.fields.percent' | transloco }}</mat-label>
              <input matInput inputmode="decimal" [formField]="form.percent" />
              <span matTextSuffix>%</span>
              @if (fromTasks) {
                <mat-hint>{{ 'wbs.hints.percentFromTasks' | transloco }}</mat-hint>
              }
              <mat-error><kora-field-error [field]="form.percent" /></mat-error>
            </mat-form-field>
          </div>
        } @else {
          <p class="kora-muted">{{ 'wbs.hints.rolledUp' | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ (data.node ? 'common.save' : 'wbs.add') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(520px, calc(100vw - 96px));
    }
    .types {
      margin: 0 0 var(--kora-space-3);
      padding: 0;
      border: 0;
    }
    legend {
      font: var(--mat-sys-title-small);
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      column-gap: var(--kora-space-3);
    }
    .row mat-form-field {
      flex: 1 1 130px;
    }
  `,
})
export class WbsNodeDialog {
  protected readonly data = inject<WbsNodeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<WbsNodeDialog, boolean>);
  private readonly directory = inject(OrgDirectory);

  protected readonly people = computed(() => this.directory.people());
  protected readonly currency = computed(() => this.directory.currency() ?? '');
  /** A node with children stays a deliverable (409 `wbs.type_change_not_allowed`). */
  protected readonly typeLocked = (this.data.node?.children.length ?? 0) > 0;
  protected readonly fromTasks = this.data.node?.percentCompleteSource === 'TASKS';

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<NodeForm>(this.initial());
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 200);
    maxLength(path.description, 4000);
    disabled(path.type, () => this.typeLocked);
    disabled(path.percent, () => this.fromTasks);
    // Effort, cost and percent are empty (and so valid) while the node is a deliverable.
    validate(path.effort, ({ value }) =>
      this.checkNumber(value(), 1_000_000, 'wbs.errors.effortRange'),
    );
    validate(path.percent, ({ value }) =>
      this.checkNumber(value(), 100, 'wbs.errors.percentRange'),
    );
    validate(path.cost, ({ value }) =>
      value().trim() && parseAmount(value(), this.currency() || 'RWF') === null
        ? { kind: I18N_ERROR, message: 'errors.fields.amount' }
        : undefined,
    );
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
    const workPackage = m.type === 'WORK_PACKAGE';
    const figures = workPackage
      ? {
          ...(number(m.effort) !== null ? { plannedEffortHours: number(m.effort) ?? 0 } : {}),
          ...(m.cost.trim()
            ? { plannedCost: parseAmount(m.cost, this.currency()) ?? undefined }
            : {}),
          ...(!this.fromTasks && number(m.percent) !== null
            ? { percentComplete: number(m.percent) ?? 0 }
            : {}),
        }
      : {};
    const common = {
      name: m.name.trim(),
      description: m.description.trim(),
      ...(m.ownerId ? { ownerId: m.ownerId } : {}),
      ...figures,
    };
    const node = this.data.node;
    const ok = await submitWithApi(this.form, this.context, () =>
      node
        ? this.data.update(node, { ...common, ...(m.type !== node.type ? { type: m.type } : {}) })
        : this.data.create({
            ...common,
            type: m.type,
            ...(this.data.parent ? { parentId: this.data.parent.id } : {}),
          }),
    );
    if (ok) this.dialogRef.close(true);
  }

  private initial(): NodeForm {
    const node = this.data.node;
    const text = (value: number | undefined) => (value === undefined ? '' : String(value));
    return {
      name: node?.name ?? '',
      description: node?.description ?? '',
      type: node?.type ?? this.data.type ?? 'WORK_PACKAGE',
      ownerId: node?.owner?.userId ?? '',
      effort: node?.type === 'WORK_PACKAGE' ? text(node.plannedEffortHours) : '',
      cost: node?.type === 'WORK_PACKAGE' ? node.plannedCost.amount : '',
      percent: node?.type === 'WORK_PACKAGE' ? text(node.percentComplete) : '',
    };
  }

  /** A number from 0 to `high` with at most two decimals, or empty. */
  private checkNumber(text: string, high: number, rangeKey: string) {
    if (!text.trim()) return undefined;
    const value = number(text);
    if (value === null || Number.isNaN(value) || !/^\d+([.,]\d{1,2})?$/.test(text.trim())) {
      return { kind: I18N_ERROR, message: 'errors.fields.number' };
    }
    return value > high ? { kind: I18N_ERROR, message: rangeKey } : undefined;
  }
}
