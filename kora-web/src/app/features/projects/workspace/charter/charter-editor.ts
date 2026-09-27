import { LiveAnnouncer } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormField, applyEach, form, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiError } from '../../../../core/api/api-error';
import { Charter, CharterContent } from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { OrgDirectory } from '../../../../core/people/org-directory';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { parseAmount } from '../../../../shared/format/money';
import { CharterStore } from './charter.store';

export const TEXT_LISTS = [
  'inScope',
  'outOfScope',
  'assumptions',
  'constraints',
  'highLevelRisks',
] as const;
export type TextListKey = (typeof TEXT_LISTS)[number];
type ListKey = TextListKey | 'objectives' | 'milestones';

interface CharterForm {
  purpose: string;
  businessCase: string;
  objectives: { text: string; successMetric: string }[];
  inScope: string[];
  outOfScope: string[];
  assumptions: string[];
  constraints: string[];
  highLevelRisks: string[];
  milestones: { name: string; targetDate: string }[];
  summaryBudget: string;
  sponsorId: string;
}

const LIST_LIMITS: Record<ListKey, number> = {
  objectives: 30,
  milestones: 50,
  inScope: 50,
  outOfScope: 50,
  assumptions: 50,
  constraints: 50,
  highLevelRisks: 50,
};

function toForm(charter: Charter): CharterForm {
  return {
    purpose: charter.purpose ?? '',
    businessCase: charter.businessCase ?? '',
    objectives: charter.objectives.map((o) => ({ ...o })),
    inScope: [...charter.inScope],
    outOfScope: [...charter.outOfScope],
    assumptions: [...charter.assumptions],
    constraints: [...charter.constraints],
    highLevelRisks: [...charter.highLevelRisks],
    milestones: charter.milestones.map((m) => ({ ...m })),
    summaryBudget: charter.summaryBudget?.amount ?? '',
    sponsorId: charter.sponsor?.userId ?? '',
  };
}

/**
 * Edits the draft charter. Every list (objectives, scope, assumptions, constraints, risks,
 * milestones) is a form array whose items can be added, removed and reordered with buttons, so it
 * works with the keyboard alone; moves are announced and focus follows the moved item. Saving
 * replaces the whole draft (PUT with If-Match).
 */
@Component({
  selector: 'kora-charter-editor',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSuffix,
    MatTooltip,
    NgTemplateOutlet,
    TranslocoPipe,
  ],
  templateUrl: './charter-editor.html',
  styleUrl: './charter-editor.scss',
})
export class CharterEditor {
  readonly charter = input.required<Charter>();
  /** Saved or cancelled: the tab goes back to the read view. */
  readonly done = output();

  private readonly store = inject(CharterStore);
  private readonly directory = inject(OrgDirectory);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly textLists = TEXT_LISTS;
  protected readonly limits = LIST_LIMITS;
  protected readonly currency = computed(() => this.directory.currency() ?? '');
  protected readonly people = computed(() => this.directory.people());

  protected readonly stale = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** A fresh copy of the charter whenever the input changes (after a reload). */
  protected readonly model = linkedSignal<CharterForm>(() => toForm(this.charter()));
  protected readonly form = form(this.model, (path) => {
    maxLength(path.purpose, 4000);
    maxLength(path.businessCase, 8000);
    applyEach(path.objectives, (objective) => {
      required(objective.text);
      maxLength(objective.text, 500);
      required(objective.successMetric);
      maxLength(objective.successMetric, 300);
    });
    for (const key of TEXT_LISTS) {
      applyEach(path[key], (item) => {
        required(item);
        maxLength(item, 500);
      });
    }
    applyEach(path.milestones, (milestone) => {
      required(milestone.name);
      maxLength(milestone.name, 200);
      required(milestone.targetDate);
    });
    validate(path.summaryBudget, ({ value }) =>
      value().trim() && parseAmount(value(), this.currency() || 'RWF') === null
        ? { kind: I18N_ERROR, message: 'errors.fields.amount' }
        : undefined,
    );
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: this.host,
    injector: this.injector,
  };

  // ---------- Lists ----------

  protected add(key: ListKey): void {
    const length = this.model()[key].length;
    if (length >= LIST_LIMITS[key]) return;
    this.model.update((m) => {
      if (key === 'objectives')
        return { ...m, objectives: [...m.objectives, { text: '', successMetric: '' }] };
      if (key === 'milestones')
        return { ...m, milestones: [...m.milestones, { name: '', targetDate: '' }] };
      return { ...m, [key]: [...m[key], ''] };
    });
    this.focusItem(key, length);
  }

  protected remove(key: ListKey, index: number): void {
    this.model.update((m) => ({
      ...m,
      [key]: m[key].filter((_: unknown, i: number) => i !== index),
    }));
    this.announce('charter.editor.removed', { position: index + 1 });
    const remaining = this.model()[key].length;
    if (remaining > 0) this.focusItem(key, Math.min(index, remaining - 1));
    else this.focusAdd(key);
  }

  protected move(key: ListKey, index: number, delta: -1 | 1): void {
    const target = index + delta;
    const list = [...this.model()[key]];
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    this.model.update((m) => ({ ...m, [key]: list }));
    this.announce('charter.editor.moved', { position: target + 1, total: list.length });
    this.focusItem(key, target);
  }

  protected itemId(key: ListKey, index: number): string {
    return `charter-${key}-${index}`;
  }

  // ---------- Save ----------

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.stale.set(false);
    const ok = await submitWithApi(
      this.form,
      this.context,
      () => this.store.replace(this.content()),
      (error: ApiError) => {
        if (error.status !== 412) return false;
        this.stale.set(true);
        return true;
      },
    );
    if (ok) this.done.emit();
  }

  /** Discards the edits and loads the charter someone else saved. */
  protected async reload(): Promise<void> {
    await this.store.load();
    this.done.emit();
  }

  private content(): CharterContent {
    const m = this.model();
    const trimList = (list: string[]) => list.map((item) => item.trim());
    const currency = this.currency();
    const amount = m.summaryBudget.trim() ? parseAmount(m.summaryBudget, currency) : null;
    return {
      ...(m.purpose.trim() ? { purpose: m.purpose.trim() } : {}),
      ...(m.businessCase.trim() ? { businessCase: m.businessCase.trim() } : {}),
      objectives: m.objectives.map((o) => ({
        text: o.text.trim(),
        successMetric: o.successMetric.trim(),
      })),
      inScope: trimList(m.inScope),
      outOfScope: trimList(m.outOfScope),
      assumptions: trimList(m.assumptions),
      constraints: trimList(m.constraints),
      highLevelRisks: trimList(m.highLevelRisks),
      milestones: m.milestones.map((ms) => ({ name: ms.name.trim(), targetDate: ms.targetDate })),
      ...(amount !== null ? { summaryBudget: { amount, currency } } : {}),
      ...(m.sponsorId ? { sponsorId: m.sponsorId } : {}),
    };
  }

  private focusItem(key: ListKey, index: number): void {
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>(`#${this.itemId(key, index)}`)?.focus(),
      { injector: this.injector },
    );
  }

  private focusAdd(key: ListKey): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#charter-add-${key}`)?.focus(),
      { injector: this.injector },
    );
  }

  private announce(key: string, params: Record<string, unknown>): void {
    void this.announcer.announce(this.transloco.translate(key, params), 'polite');
  }
}
