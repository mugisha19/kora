import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { PortfolioStatus } from '../../core/api/api.models';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { toApiError } from '../../core/api/api-error';
import { canManagePortfolios } from '../../core/auth/permissions';
import { SessionStore } from '../../core/session/session.store';
import { QueryParams, oneOfParam } from '../../shared/routing/query-params';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusChip } from '../../shared/ui/status-chip';
import { PortfolioFacade } from './portfolio.facade';

type StatusFilter = PortfolioStatus | 'ALL';
const STATUS_FILTERS: readonly StatusFilter[] = ['ACTIVE', 'ARCHIVED', 'ALL'];

/**
 * `/portfolios`: the organization's portfolios as cards (objectives, owner, program and project
 * counts). Search and the active/archived filter are in the URL. PMO and admins can create.
 */
@Component({
  selector: 'kora-portfolios-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatPrefix,
    PageHeader,
    RouterLink,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [QueryParams],
  template: `
    <kora-page-header
      [heading]="'portfolios.title' | transloco"
      [subtitle]="'portfolios.subtitle' | transloco"
    >
      @if (canManage()) {
        <button mat-flat-button type="button" (click)="create()">
          <mat-icon svgIcon="add" aria-hidden="true" />
          {{ 'portfolios.create' | transloco }}
        </button>
      }
    </kora-page-header>

    <div class="filters">
      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>{{ 'portfolios.search' | transloco }}</mat-label>
        <mat-icon matPrefix svgIcon="search" aria-hidden="true" />
        <input matInput type="search" [value]="q() ?? ''" (input)="onSearch($event)" />
      </mat-form-field>
      <mat-button-toggle-group
        [value]="statusFilter()"
        [attr.aria-label]="'portfolios.statusFilter' | transloco"
        (change)="query.set({ status: $event.value === 'ACTIVE' ? null : $event.value })"
      >
        @for (filter of statusFilters; track filter) {
          <mat-button-toggle [value]="filter">
            {{ 'portfolios.filter.' + filter | transloco }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
    </div>

    @if (portfolios.isLoading() && !portfolios.hasValue()) {
      <kora-loading-state />
    } @else if (portfolios.error()) {
      <kora-error-state [correlationId]="errorId()" (retry)="portfolios.reload()" />
    } @else if (items().length === 0) {
      <kora-empty-state
        icon="folder_open"
        [heading]="'portfolios.emptyTitle' | transloco"
        [message]="
          (canManage() ? 'portfolios.emptyMessageManager' : 'portfolios.emptyMessage') | transloco
        "
      />
    } @else {
      <ul class="cards" [attr.aria-busy]="portfolios.isLoading()">
        @for (portfolio of items(); track portfolio.id) {
          <li class="card">
            <div class="card-head">
              <h2>
                <a [routerLink]="['/portfolios', portfolio.id]">{{ portfolio.name }}</a>
              </h2>
              @if (portfolio.status === 'ARCHIVED') {
                <kora-status-chip
                  tone="neutral"
                  icon="inventory_2"
                  [label]="'portfolioStatus.ARCHIVED' | transloco"
                />
              }
            </div>
            @if (portfolio.description) {
              <p class="description">{{ portfolio.description }}</p>
            }
            @if (portfolio.strategicObjectives.length) {
              <h3 class="visually-hidden">{{ 'portfolios.fields.objectives' | transloco }}</h3>
              <ul class="objectives">
                @for (objective of portfolio.strategicObjectives; track $index) {
                  <li>{{ objective }}</li>
                }
              </ul>
            }
            <dl class="facts">
              <div>
                <dt>{{ 'portfolios.fields.owner' | transloco }}</dt>
                <dd>{{ portfolio.owner.fullName }}</dd>
              </div>
              <div>
                <dt>{{ 'portfolios.fields.programs' | transloco }}</dt>
                <dd>{{ portfolio.programCount }}</dd>
              </div>
              <div>
                <dt>{{ 'portfolios.fields.projects' | transloco }}</dt>
                <dd>{{ portfolio.projectCount }}</dd>
              </div>
            </dl>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: '../../shared/ui/data-table.scss',
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
      gap: var(--kora-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--kora-space-2);
      padding: var(--kora-space-4);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
      background: var(--mat-sys-surface-container-low);
    }
    .card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--kora-space-2);
    }
    h2 {
      font: var(--mat-sys-title-large);
    }
    .description {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .objectives {
      margin: 0;
      padding-inline-start: var(--kora-space-6);
      font: var(--mat-sys-body-medium);
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-6);
      margin: auto 0 0;
      padding-block-start: var(--kora-space-2);
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    dd {
      margin: 0;
      font: var(--mat-sys-title-small);
    }
  `,
})
export class PortfoliosPage {
  /** Query parameters (bound by the router). */
  readonly q = input<string>();
  readonly status = input<string>();

  private readonly api = inject(PortfoliosApi);
  private readonly facade = inject(PortfolioFacade);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  protected readonly query = inject(QueryParams);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly statusFilter = computed(
    () => oneOfParam(this.status(), STATUS_FILTERS) ?? 'ACTIVE',
  );
  protected readonly canManage = computed(() => canManagePortfolios(this.session.activeRole()));

  protected readonly portfolios = resource({
    params: () => ({
      q: this.q()?.trim() || undefined,
      status: this.statusFilter() === 'ALL' ? undefined : (this.statusFilter() as PortfolioStatus),
      org: this.session.activeOrganizationId(),
    }),
    loader: ({ params: { q, status } }) =>
      firstValueFrom(this.api.list({ q, status, size: 100, sort: ['name,asc'] })),
  });
  protected readonly items = computed(() =>
    this.portfolios.hasValue() ? this.portfolios.value().content : [],
  );
  protected readonly errorId = computed(() => {
    const error = this.portfolios.error();
    return error ? toApiError(error).correlationId : undefined;
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.query.set({ q: value.trim() }), 300);
  }

  protected async create(): Promise<void> {
    const created = await this.facade.createPortfolio();
    if (created) await this.router.navigate(['/portfolios', created.id]);
  }
}
