import {
  Component,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import {
  FormField,
  disabled,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  validate,
} from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import {
  CreateProjectRequest,
  METHODOLOGIES,
  Methodology,
  Project,
  UpdateProjectRequest,
} from '../../core/api/api.models';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { ProjectsApi } from '../../core/api/projects.api';
import { MANAGER_ROLES, canManageProjects } from '../../core/auth/permissions';
import { ErrorMessages } from '../../core/errors/error-messages';
import { Notifier } from '../../core/notify/notifier';
import { OrgDirectory } from '../../core/people/org-directory';
import { SessionStore } from '../../core/session/session.store';
import { FieldError, I18N_ERROR } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { parseAmount } from '../../shared/format/money';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { METHODOLOGY_STRATEGIES } from './methodology';

interface ProjectForm {
  code: string;
  name: string;
  description: string;
  portfolioId: string;
  programId: string;
  methodology: Methodology | '';
  managerId: string;
  startDate: string;
  targetEndDate: string;
  budget: string;
}

/**
 * `/projects/new?portfolioId=` creates a project; `/projects/:projectId/edit` edits one (code and
 * portfolio are fixed; the methodology only changes while PROPOSED). The methodology picker
 * explains what each choice changes in the workspace; dates must end after they start; the budget
 * is typed in the organization's currency and sent as an exact decimal string.
 */
@Component({
  selector: 'kora-project-form-page',
  imports: [
    ErrorState,
    FieldError,
    FormField,
    LoadingState,
    MatButton,
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
    MatSelectTrigger,
    MatSuffix,
    PageHeader,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <kora-page-header
      [heading]="(projectId() ? 'projects.editTitle' : 'projects.createTitle') | transloco"
      [subtitle]="
        existing.hasValue()
          ? existing.value().code + ' · ' + existing.value().name
          : ('projects.createSubtitle' | transloco)
      "
    />
    @if (projectId() && existing.error()) {
      <kora-error-state [correlationId]="existingErrorId()" (retry)="existing.reload()" />
    } @else if (projectId() && !loaded()) {
      <kora-loading-state />
    } @else {
      <form class="kora-form project-form" novalidate (submit)="save($event)">
        @if (stale()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ 'errors.status.412' | transloco }}</p>
            <button mat-button type="button" (click)="reloadExisting()">
              {{ 'common.reload' | transloco }}
            </button>
          </div>
        } @else if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }

        <div class="row">
          <mat-form-field class="code" subscriptSizing="dynamic">
            <mat-label>{{ 'projects.fields.code' | transloco }}</mat-label>
            <input matInput autocomplete="off" [formField]="form.code" (blur)="upperCaseCode()" />
            <mat-hint>{{ 'projects.hints.code' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.code" /></mat-error>
          </mat-form-field>
          <mat-form-field class="grow">
            <mat-label>{{ 'projects.fields.name' | transloco }}</mat-label>
            <input matInput [formField]="form.name" />
            <mat-error><kora-field-error [field]="form.name" /></mat-error>
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'projects.fields.description' | transloco }}</mat-label>
          <textarea matInput rows="3" [formField]="form.description"></textarea>
          <mat-error><kora-field-error [field]="form.description" /></mat-error>
        </mat-form-field>

        <div class="row">
          <mat-form-field class="grow">
            <mat-label>{{ 'projects.fields.portfolio' | transloco }}</mat-label>
            <mat-select [formField]="form.portfolioId">
              @for (portfolio of portfolios(); track portfolio.id) {
                <mat-option [value]="portfolio.id">{{ portfolio.name }}</mat-option>
              }
            </mat-select>
            <mat-error><kora-field-error [field]="form.portfolioId" /></mat-error>
          </mat-form-field>
          <mat-form-field class="grow">
            <mat-label>{{ 'projects.fields.program' | transloco }}</mat-label>
            <mat-select [formField]="form.programId">
              <mat-option value="">{{ 'projects.noProgram' | transloco }}</mat-option>
              @for (program of programs(); track program.id) {
                <mat-option [value]="program.id">{{ program.name }}</mat-option>
              }
            </mat-select>
            <mat-error><kora-field-error [field]="form.programId" /></mat-error>
          </mat-form-field>
        </div>

        <fieldset class="methodology">
          <legend>{{ 'projects.fields.methodology' | transloco }}</legend>
          <mat-radio-group [formField]="form.methodology" class="choices">
            @for (value of methodologies; track value) {
              <mat-radio-button [value]="value" class="choice">
                <span class="choice-name">
                  <mat-icon [svgIcon]="strategies[value].icon" aria-hidden="true" />
                  {{ 'methodology.' + value + '.name' | transloco }}
                </span>
                <span class="choice-hint">{{ 'methodology.' + value + '.hint' | transloco }}</span>
              </mat-radio-button>
            }
          </mat-radio-group>
          @if (methodologyLocked()) {
            <p class="kora-muted">{{ 'projects.hints.methodologyLocked' | transloco }}</p>
          }
          @if (form.methodology().touched() && form.methodology().invalid()) {
            <p class="radio-error" role="alert"><kora-field-error [field]="form.methodology" /></p>
          }
        </fieldset>

        <mat-form-field>
          <mat-label>{{ 'projects.fields.manager' | transloco }}</mat-label>
          <mat-select [formField]="form.managerId">
            <!-- Set explicitly: the role label may arrive after the first render (deep link). -->
            <mat-select-trigger>
              @if (selectedManager(); as person) {
                {{ person.fullName }} · {{ 'roles.' + person.role | transloco }}
              }
            </mat-select-trigger>
            @for (person of managers(); track person.userId) {
              <mat-option [value]="person.userId">
                {{ person.fullName }} · {{ 'roles.' + person.role | transloco }}
              </mat-option>
            }
          </mat-select>
          <mat-error><kora-field-error [field]="form.managerId" /></mat-error>
        </mat-form-field>

        <div class="row">
          <mat-form-field class="grow">
            <mat-label>{{ 'projects.fields.startDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.startDate" />
            <mat-error><kora-field-error [field]="form.startDate" /></mat-error>
          </mat-form-field>
          <mat-form-field class="grow">
            <mat-label>{{ 'projects.fields.targetEndDate' | transloco }}</mat-label>
            <input matInput type="date" [formField]="form.targetEndDate" />
            <mat-error><kora-field-error [field]="form.targetEndDate" /></mat-error>
          </mat-form-field>
          <mat-form-field class="grow">
            <mat-label>{{ 'projects.fields.budget' | transloco }}</mat-label>
            <input matInput inputmode="decimal" autocomplete="off" [formField]="form.budget" />
            <span matTextSuffix>{{ currency() }}</span>
            <mat-hint>{{ 'common.optional' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.budget" /></mat-error>
          </mat-form-field>
        </div>

        <div class="kora-form-actions">
          <a mat-button [routerLink]="projectId() ? ['/projects', projectId()] : ['/projects']">
            {{ 'common.cancel' | transloco }}
          </a>
          <button mat-flat-button type="submit" [disabled]="form().submitting()">
            {{ (projectId() ? 'common.save' : 'projects.create') | transloco }}
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .project-form {
      max-inline-size: 760px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      column-gap: var(--kora-space-4);
    }
    .row > * {
      flex: 1 1 200px;
    }
    .row > .code {
      flex: 0 1 200px;
    }
    .methodology {
      margin: 0 0 var(--kora-space-4);
      padding: 0;
      border: 0;
    }
    legend {
      margin-block-end: var(--kora-space-2);
      font: var(--mat-sys-title-small);
    }
    .choices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--kora-space-3);
    }
    .choice {
      padding: var(--kora-space-2);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
    }
    .choice-name {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      font: var(--mat-sys-title-small);
    }
    .choice-hint {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .radio-error {
      margin: var(--kora-space-1) 0 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ProjectFormPage {
  /** `?portfolioId=` preselects the portfolio (from a portfolio page). */
  readonly portfolioId = input<string>();
  /** Route parameter in edit mode. */
  readonly projectId = input<string>();

  private readonly api = inject(ProjectsApi);
  private readonly portfoliosApi = inject(PortfoliosApi);
  private readonly directory = inject(OrgDirectory);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);

  protected readonly methodologies = METHODOLOGIES;
  protected readonly strategies = METHODOLOGY_STRATEGIES;
  protected readonly currency = computed(() => this.directory.currency() ?? '');
  protected readonly managers = computed(() => this.directory.peopleWith(MANAGER_ROLES));
  protected readonly selectedManager = computed(() =>
    this.managers().find((p) => p.userId === this.model().managerId),
  );

  /** The project being edited. */
  protected readonly existing = resource({
    params: () => this.projectId(),
    loader: ({ params }) => firstValueFrom(this.api.get(params)),
  });
  protected readonly existingErrorId = computed(() => {
    const error = this.existing.error();
    return error ? toApiError(error).correlationId : undefined;
  });
  /** In edit mode, the form shows once the project has been copied into it. */
  protected readonly loaded = signal(false);
  protected readonly methodologyLocked = computed(
    () => this.existing.hasValue() && this.existing.value().status !== 'PROPOSED',
  );
  protected readonly stale = signal(false);

  private readonly portfolioList = resource({
    loader: () => firstValueFrom(this.portfoliosApi.list({ size: 100, sort: ['name,asc'] })),
  });
  /** Active portfolios, plus the edited project's own (so the disabled select still shows it). */
  protected readonly portfolios = computed(() =>
    this.portfolioList.hasValue()
      ? this.portfolioList
          .value()
          .content.filter((p) => p.status === 'ACTIVE' || p.id === this.model().portfolioId)
      : [],
  );

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<ProjectForm>({
    code: '',
    name: '',
    description: '',
    portfolioId: '',
    programId: '',
    methodology: '',
    managerId: canManageProjects(this.session.activeRole() ?? 'VIEWER')
      ? (this.session.user()?.id ?? '')
      : '',
    startDate: '',
    targetEndDate: '',
    budget: '',
  });

  private readonly programList = resource({
    params: () => this.model().portfolioId || undefined,
    loader: ({ params }) => firstValueFrom(this.portfoliosApi.listPrograms(params)),
  });
  protected readonly programs = computed(() =>
    this.programList.hasValue()
      ? this.programList
          .value()
          .filter((p) => p.status === 'ACTIVE' || p.id === this.model().programId)
      : [],
  );

  protected readonly form = form(this.model, (path) => {
    disabled(path.code, () => Boolean(this.projectId()));
    disabled(path.portfolioId, () => Boolean(this.projectId()));
    disabled(path.methodology, () => this.methodologyLocked());
    required(path.code);
    pattern(path.code, /^[A-Z][A-Z0-9-]{1,14}$/);
    required(path.name);
    minLength(path.name, 2);
    maxLength(path.name, 150);
    maxLength(path.description, 4000);
    required(path.portfolioId);
    required(path.methodology);
    required(path.managerId);
    required(path.startDate);
    required(path.targetEndDate);
    validate(path.targetEndDate, ({ value, valueOf }) => {
      const start = valueOf(path.startDate);
      return start && value() && value() <= start
        ? { kind: I18N_ERROR, message: 'projects.errors.endBeforeStart' }
        : undefined;
    });
    validate(path.budget, ({ value }) =>
      value().trim() && parseAmount(value(), this.currency() || 'RWF') === null
        ? { kind: I18N_ERROR, message: 'errors.fields.amount' }
        : undefined,
    );
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  constructor() {
    effect(() => {
      if (this.existing.hasValue()) {
        const project = this.existing.value();
        untracked(() => this.fill(project));
      }
    });
    // Preselect the portfolio from the URL, and drop a program that isn't in the chosen one.
    effect(() => {
      const preselected = this.portfolioId();
      if (preselected && !this.projectId()) {
        untracked(() => this.model.update((m) => ({ ...m, portfolioId: preselected })));
      }
    });
    effect(() => {
      const programs = this.programs();
      const programId = untracked(() => this.model().programId);
      if (programId && this.programList.hasValue() && !programs.some((p) => p.id === programId)) {
        untracked(() => this.model.update((m) => ({ ...m, programId: '' })));
      }
    });
  }

  /** Loads what the other person saved; the form is hidden until it's refilled with it. */
  protected reloadExisting(): void {
    this.stale.set(false);
    this.loaded.set(false);
    this.existing.reload();
  }

  protected upperCaseCode(): void {
    this.model.update((m) => ({ ...m, code: m.code.trim().toUpperCase() }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.upperCaseCode();
    const value = this.model();
    const currency = this.currency();
    const amount = value.budget.trim() ? parseAmount(value.budget, currency) : null;
    const common: UpdateProjectRequest = {
      name: value.name.trim(),
      ...(value.description.trim() ? { description: value.description.trim() } : {}),
      ...(value.programId ? { programId: value.programId } : {}),
      managerId: value.managerId,
      startDate: value.startDate,
      targetEndDate: value.targetEndDate,
      ...(amount !== null ? { budget: { amount, currency } } : {}),
    };
    const existing = this.existing.hasValue() ? this.existing.value() : null;
    let savedId = '';
    this.stale.set(false);
    const ok = await submitWithApi(
      this.form,
      this.context,
      async () => {
        const saved = existing
          ? await firstValueFrom(
              this.api.update(existing.id, this.changes(existing, common), existing.version),
            )
          : await firstValueFrom(this.api.create(this.createRequest(common)));
        savedId = saved.id;
        this.notifier.success(
          this.transloco.translate(existing ? 'projects.saved' : 'projects.created', {
            name: saved.name,
          }),
        );
      },
      (error: ApiError) => {
        if (error.status !== 412) return false;
        this.stale.set(true);
        return true;
      },
    );
    if (ok) await this.router.navigate(['/projects', savedId]);
  }

  private fill(project: Project): void {
    this.model.set({
      code: project.code,
      name: project.name,
      description: project.description ?? '',
      portfolioId: project.portfolioId,
      programId: project.programId ?? '',
      methodology: project.methodology,
      managerId: project.manager.userId,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate,
      budget: project.budget?.amount ?? '',
    });
    this.loaded.set(true);
  }

  private createRequest(common: UpdateProjectRequest): CreateProjectRequest {
    const value = this.model();
    return {
      ...common,
      code: value.code,
      name: value.name.trim(),
      portfolioId: value.portfolioId,
      methodology: value.methodology as Methodology,
      startDate: value.startDate,
      targetEndDate: value.targetEndDate,
    };
  }

  /** The PATCH body: the edited fields, plus the methodology only while it may still change. */
  private changes(project: Project, common: UpdateProjectRequest): UpdateProjectRequest {
    const methodology = this.model().methodology;
    return project.status === 'PROPOSED' && methodology
      ? { ...common, methodology: methodology as Methodology }
      : common;
  }
}
