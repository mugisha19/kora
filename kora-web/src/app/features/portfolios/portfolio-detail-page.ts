import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Portfolio, Program, Project } from '../../core/api/api.models';
import { toApiError } from '../../core/api/api-error';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { ProjectsApi } from '../../core/api/projects.api';
import { canCreateProject, canManagePortfolios } from '../../core/auth/permissions';
import { SessionStore } from '../../core/session/session.store';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusChip } from '../../shared/ui/status-chip';
import { ProjectTable } from '../projects/ui/project-table';
import { PortfolioFacade } from './portfolio.facade';

interface ProgramGroup {
  program: Program | null;
  projects: Project[];
}

/**
 * `/portfolios/:portfolioId`: strategic objectives, then the portfolio's projects grouped by
 * program (projects outside a program last), each with status and RAG health. An archived
 * portfolio is read-only: only "Reactivate" is offered.
 */
@Component({
  selector: 'kora-portfolio-detail-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    PageHeader,
    ProjectTable,
    RouterLink,
    StatusChip,
    TranslocoPipe,
  ],
  template: `
    <a mat-button routerLink="/portfolios" class="back">
      <mat-icon svgIcon="arrow_back" aria-hidden="true" />
      {{ 'portfolios.backToList' | transloco }}
    </a>

    @if (portfolio.isLoading() && !portfolio.hasValue()) {
      <kora-loading-state />
    } @else if (notFound()) {
      <kora-empty-state
        icon="search"
        [heading]="'portfolios.notFoundTitle' | transloco"
        [message]="'portfolios.notFoundMessage' | transloco"
      />
    } @else if (portfolio.error()) {
      <kora-error-state [correlationId]="errorId()" (retry)="reloadAll()" />
    } @else if (portfolio.hasValue()) {
      @let p = portfolio.value();
      <kora-page-header [heading]="p.name" [subtitle]="p.description ?? ''">
        @if (canManage()) {
          @if (archived()) {
            <button mat-stroked-button type="button" (click)="setArchived(p, false)">
              <mat-icon svgIcon="unarchive" aria-hidden="true" />
              {{ 'portfolios.reactivate' | transloco }}
            </button>
          } @else {
            <button mat-stroked-button type="button" (click)="edit(p)">
              <mat-icon svgIcon="edit" aria-hidden="true" />
              {{ 'common.edit' | transloco }}
            </button>
          }
          <button
            mat-stroked-button
            type="button"
            [matMenuTriggerFor]="more"
            [attr.aria-label]="'common.moreActions' | transloco"
          >
            <mat-icon svgIcon="more_vert" aria-hidden="true" />
            {{ 'common.more' | transloco }}
          </button>
          <mat-menu #more="matMenu">
            @if (!archived()) {
              <button mat-menu-item type="button" (click)="setArchived(p, true)">
                <mat-icon svgIcon="inventory_2" aria-hidden="true" />
                {{ 'portfolios.archive' | transloco }}
              </button>
            }
            <button
              mat-menu-item
              type="button"
              [disabled]="p.programCount + p.projectCount > 0"
              (click)="remove(p)"
            >
              <mat-icon svgIcon="delete" aria-hidden="true" />
              {{
                (p.programCount + p.projectCount > 0
                  ? 'portfolios.deleteNotEmpty'
                  : 'common.delete'
                ) | transloco
              }}
            </button>
          </mat-menu>
        }
      </kora-page-header>

      @if (archived()) {
        <div class="kora-notice info" role="note">
          <mat-icon svgIcon="inventory_2" aria-hidden="true" />
          <p>{{ 'portfolios.archivedNotice' | transloco }}</p>
        </div>
      }

      <section class="summary" [attr.aria-label]="'portfolios.summary' | transloco">
        <dl class="facts">
          <div>
            <dt>{{ 'portfolios.fields.owner' | transloco }}</dt>
            <dd>{{ p.owner.fullName }}</dd>
          </div>
          <div>
            <dt>{{ 'portfolios.fields.status' | transloco }}</dt>
            <dd>
              <kora-status-chip
                [tone]="archived() ? 'neutral' : 'success'"
                [icon]="archived() ? 'inventory_2' : 'check_circle'"
                [label]="'portfolioStatus.' + p.status | transloco"
              />
            </dd>
          </div>
          <div>
            <dt>{{ 'portfolios.fields.projects' | transloco }}</dt>
            <dd>{{ p.projectCount }}</dd>
          </div>
        </dl>
        @if (p.strategicObjectives.length) {
          <h2>{{ 'portfolios.fields.objectives' | transloco }}</h2>
          <ul class="objectives">
            @for (objective of p.strategicObjectives; track $index) {
              <li>{{ objective }}</li>
            }
          </ul>
        }
      </section>

      <div class="section-head">
        <h2>{{ 'portfolios.programsAndProjects' | transloco }}</h2>
        <div class="actions">
          @if (canManage() && !archived()) {
            <button mat-stroked-button type="button" (click)="createProgram(p)">
              <mat-icon svgIcon="add" aria-hidden="true" />
              {{ 'programs.create' | transloco }}
            </button>
          }
          @if (canCreate() && !archived()) {
            <a mat-flat-button routerLink="/projects/new" [queryParams]="{ portfolioId: p.id }">
              <mat-icon svgIcon="add" aria-hidden="true" />
              {{ 'projects.create' | transloco }}
            </a>
          }
        </div>
      </div>

      @if (programs.error() || projects.error()) {
        <kora-error-state (retry)="reloadAll()" />
      } @else if (!programs.hasValue() || !projects.hasValue()) {
        <kora-loading-state />
      } @else if (groups().length === 0) {
        <kora-empty-state
          icon="folder_open"
          [heading]="'portfolios.noProjectsTitle' | transloco"
          [message]="'portfolios.noProjectsMessage' | transloco"
        />
      } @else {
        @for (group of groups(); track group.program?.id ?? 'none') {
          <section class="group">
            <div class="group-head">
              <h3>
                {{ group.program?.name ?? ('portfolios.withoutProgram' | transloco) }}
              </h3>
              @if (group.program; as program) {
                <span class="kora-muted">
                  {{ 'programs.managedBy' | transloco: { name: program.manager.fullName } }}
                </span>
                @if (program.status === 'CLOSED') {
                  <kora-status-chip
                    tone="neutral"
                    icon="check_circle"
                    [label]="'programStatus.CLOSED' | transloco"
                  />
                }
                @if (canManage() && !archived()) {
                  <button
                    mat-button
                    type="button"
                    [attr.aria-label]="'programs.editNamed' | transloco: { name: program.name }"
                    (click)="editProgram(program)"
                  >
                    <mat-icon svgIcon="edit" aria-hidden="true" />
                    {{ 'common.edit' | transloco }}
                  </button>
                }
              }
            </div>
            @if (group.projects.length) {
              <kora-project-table
                [projects]="group.projects"
                [caption]="group.program?.name ?? ('portfolios.withoutProgram' | transloco)"
              />
            } @else {
              <p class="kora-muted">{{ 'programs.noProjects' | transloco }}</p>
            }
          </section>
        }
      }
    }
  `,
  styles: `
    .back {
      margin-block-end: var(--kora-space-2);
    }
    .summary {
      margin-block-end: var(--kora-space-8);
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-8);
      margin: 0 0 var(--kora-space-4);
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    dd {
      margin: var(--kora-space-1) 0 0;
      font: var(--mat-sys-title-small);
    }
    h2 {
      font: var(--mat-sys-title-large);
    }
    .objectives {
      margin: var(--kora-space-2) 0 0;
      padding-inline-start: var(--kora-space-6);
    }
    .section-head,
    .group-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kora-space-3);
    }
    .section-head {
      justify-content: space-between;
      margin-block-end: var(--kora-space-4);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
    }
    .group {
      margin-block-end: var(--kora-space-6);
    }
    .group-head {
      margin-block-end: var(--kora-space-2);
    }
    h3 {
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class PortfolioDetailPage {
  /** Route parameter. */
  readonly portfolioId = input.required<string>();

  private readonly api = inject(PortfoliosApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly facade = inject(PortfolioFacade);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);

  protected readonly portfolio = resource({
    params: () => this.portfolioId(),
    loader: ({ params }) => firstValueFrom(this.api.get(params)),
  });
  protected readonly programs = resource({
    params: () => this.portfolioId(),
    loader: ({ params }) => firstValueFrom(this.api.listPrograms(params)),
  });
  protected readonly projects = resource({
    params: () => this.portfolioId(),
    loader: ({ params }) =>
      firstValueFrom(this.projectsApi.list({ portfolioId: params, size: 100, sort: ['code,asc'] })),
  });

  protected readonly canManage = computed(() => canManagePortfolios(this.session.activeRole()));
  protected readonly canCreate = computed(() => canCreateProject(this.session.activeRole()));
  protected readonly archived = computed(
    () => this.portfolio.hasValue() && this.portfolio.value().status === 'ARCHIVED',
  );
  protected readonly notFound = computed(() => {
    const error = this.portfolio.error();
    return error ? toApiError(error).status === 404 : false;
  });
  protected readonly errorId = computed(() => {
    const error = this.portfolio.error();
    return error ? toApiError(error).correlationId : undefined;
  });

  /** Programs (each with its projects, empty ones too), then projects outside any program. */
  protected readonly groups = computed<ProgramGroup[]>(() => {
    const programs = this.programs.hasValue() ? this.programs.value() : [];
    const projects = this.projects.hasValue() ? this.projects.value().content : [];
    const groups: ProgramGroup[] = programs.map((program) => ({
      program,
      projects: projects.filter((p) => p.programId === program.id),
    }));
    const loose = projects.filter((p) => !programs.some((g) => g.id === p.programId));
    return loose.length ? [...groups, { program: null, projects: loose }] : groups;
  });

  protected reloadAll(): void {
    this.portfolio.reload();
    this.programs.reload();
    this.projects.reload();
  }

  protected async edit(portfolio: Portfolio): Promise<void> {
    const saved = await this.facade.editPortfolio(portfolio);
    if (saved) this.portfolio.set(saved);
  }

  protected async setArchived(portfolio: Portfolio, archived: boolean): Promise<void> {
    const saved = await this.facade.setArchived(portfolio, archived);
    if (saved) this.portfolio.set(saved);
  }

  protected async remove(portfolio: Portfolio): Promise<void> {
    if (await this.facade.deletePortfolio(portfolio)) {
      await this.router.navigate(['/portfolios']);
    }
  }

  protected async createProgram(portfolio: Portfolio): Promise<void> {
    if (await this.facade.createProgram(portfolio)) {
      this.programs.reload();
      this.portfolio.reload();
    }
  }

  protected async editProgram(program: Program): Promise<void> {
    if (await this.facade.editProgram(program)) this.programs.reload();
  }
}
