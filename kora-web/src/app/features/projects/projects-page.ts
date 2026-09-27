import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  HEALTHS,
  ListProjectsQuery,
  METHODOLOGIES,
  PROJECT_SORT_FIELDS,
  PROJECT_STATUSES,
} from '../../core/api/api.models';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { canCreateProject } from '../../core/auth/permissions';
import { SessionStore } from '../../core/session/session.store';
import { QueryParams, intParam, oneOfParam } from '../../shared/routing/query-params';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { ProjectsStore } from './projects.store';
import { ProjectTable } from './ui/project-table';

type SortField = (typeof PROJECT_SORT_FIELDS)[number];
const PAGE_SIZES = [10, 20, 50];

/*
 * Selects whose options are translated set a <mat-select-trigger>: MatOption only reports a new
 * label when the previous one wasn't empty, so a select rendered before the translations arrived
 * (a deep link) would otherwise keep showing a blank value.
 */

/**
 * `/projects`: the projects you can see (PMO and admins see all), with server-side filters, sort
 * and paging, all kept in the URL so a filtered list can be shared or bookmarked.
 */
@Component({
  selector: 'kora-projects-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatPaginator,
    MatPrefix,
    MatSelect,
    MatSelectTrigger,
    PageHeader,
    ProjectTable,
    RouterLink,
    TranslocoPipe,
  ],
  providers: [ProjectsStore, QueryParams],
  template: `
    <kora-page-header
      [heading]="'projects.title' | transloco"
      [subtitle]="'projects.subtitle' | transloco"
    >
      @if (canCreate()) {
        <a mat-flat-button routerLink="/projects/new">
          <mat-icon svgIcon="add" aria-hidden="true" />
          {{ 'projects.create' | transloco }}
        </a>
      }
    </kora-page-header>

    <div class="filters">
      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>{{ 'projects.search' | transloco }}</mat-label>
        <mat-icon matPrefix svgIcon="search" aria-hidden="true" />
        <input matInput type="search" [value]="q() ?? ''" (input)="onSearch($event)" />
      </mat-form-field>
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'projects.fields.portfolio' | transloco }}</mat-label>
        <mat-select
          [value]="query().portfolioId ?? null"
          (selectionChange)="filter('portfolioId', $event.value)"
        >
          <mat-option [value]="null">{{ 'projects.filters.allPortfolios' | transloco }}</mat-option>
          @for (portfolio of portfolios(); track portfolio.id) {
            <mat-option [value]="portfolio.id">{{ portfolio.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'projects.fields.status' | transloco }}</mat-label>
        <mat-select
          [value]="query().status ?? null"
          (selectionChange)="filter('status', $event.value)"
        >
          <mat-select-trigger>{{
            'projectStatus.' + query().status | transloco
          }}</mat-select-trigger>
          <mat-option [value]="null">{{ 'projects.filters.allStatuses' | transloco }}</mat-option>
          @for (value of statuses; track value) {
            <mat-option [value]="value">{{ 'projectStatus.' + value | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'projects.fields.methodology' | transloco }}</mat-label>
        <mat-select
          [value]="query().methodology ?? null"
          (selectionChange)="filter('methodology', $event.value)"
        >
          <mat-select-trigger>
            {{ 'methodology.' + query().methodology + '.name' | transloco }}
          </mat-select-trigger>
          <mat-option [value]="null">{{
            'projects.filters.allMethodologies' | transloco
          }}</mat-option>
          @for (value of methodologies; track value) {
            <mat-option [value]="value">{{
              'methodology.' + value + '.name' | transloco
            }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'projects.fields.health' | transloco }}</mat-label>
        <mat-select
          [value]="query().health ?? null"
          (selectionChange)="filter('health', $event.value)"
        >
          <mat-select-trigger>{{ 'health.' + query().health | transloco }}</mat-select-trigger>
          <mat-option [value]="null">{{ 'projects.filters.allHealth' | transloco }}</mat-option>
          @for (value of healths; track value) {
            <mat-option [value]="value">{{ 'health.' + value | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (filtered()) {
        <button mat-button type="button" (click)="clearFilters()">
          <mat-icon svgIcon="close" aria-hidden="true" />
          {{ 'projects.filters.clear' | transloco }}
        </button>
      }
    </div>

    <p class="count" role="status">
      @if (store.status() === 'ready') {
        {{ 'projects.count' | transloco: { count: store.total() } }}
      }
    </p>

    @if (store.status() === 'loading' && store.result() === null) {
      <kora-loading-state />
    } @else if (store.status() === 'error') {
      <kora-error-state [correlationId]="store.error()?.correlationId" (retry)="store.reload()" />
    } @else if (store.total() === 0) {
      <kora-empty-state
        icon="folder_open"
        [heading]="(filtered() ? 'projects.noMatchTitle' : 'projects.emptyTitle') | transloco"
        [message]="
          (filtered()
            ? 'projects.noMatchMessage'
            : canCreate()
              ? 'projects.emptyMessageManager'
              : 'projects.emptyMessage'
          ) | transloco
        "
      />
    } @else {
      <kora-project-table
        [attr.aria-busy]="store.status() === 'loading'"
        [projects]="store.projects()"
        [caption]="'projects.title' | transloco"
        [sortable]="true"
        [sortActive]="sortField()"
        [sortDirection]="sortDirection()"
        (sortChange)="onSort($event)"
      />
      <mat-paginator
        [length]="store.total()"
        [pageIndex]="query().page ?? 0"
        [pageSize]="query().size ?? 20"
        [pageSizeOptions]="pageSizes"
        (page)="onPage($event)"
      />
    }
  `,
  styleUrl: '../../shared/ui/data-table.scss',
})
export class ProjectsPage {
  /** Query parameters (bound by the router). */
  readonly q = input<string>();
  readonly status = input<string>();
  readonly methodology = input<string>();
  readonly health = input<string>();
  readonly portfolioId = input<string>();
  readonly sort = input<string>();
  readonly page = input<string>();
  readonly size = input<string>();

  protected readonly store = inject(ProjectsStore);
  private readonly portfoliosApi = inject(PortfoliosApi);
  private readonly session = inject(SessionStore);
  private readonly queryParams = inject(QueryParams);

  protected readonly statuses = PROJECT_STATUSES;
  protected readonly methodologies = METHODOLOGIES;
  protected readonly healths = HEALTHS;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly canCreate = computed(() => canCreateProject(this.session.activeRole()));

  protected readonly sortField = computed<SortField>(
    () => oneOfParam(this.sort()?.split(',')[0], PROJECT_SORT_FIELDS) ?? 'code',
  );
  protected readonly sortDirection = computed(() =>
    this.sort()?.split(',')[1] === 'desc' ? 'desc' : 'asc',
  );

  /** The URL, validated, as an API query. Unknown values are ignored rather than sent. */
  protected readonly query = computed<ListProjectsQuery>(() => ({
    q: this.q()?.trim() || undefined,
    status: oneOfParam(this.status(), PROJECT_STATUSES) ?? undefined,
    methodology: oneOfParam(this.methodology(), METHODOLOGIES) ?? undefined,
    health: oneOfParam(this.health(), HEALTHS) ?? undefined,
    portfolioId: this.portfolioId() || undefined,
    page: intParam(this.page(), 0),
    size: PAGE_SIZES.includes(intParam(this.size(), 20)) ? intParam(this.size(), 20) : 20,
    sort: [`${this.sortField()},${this.sortDirection()}`],
  }));
  protected readonly filtered = computed(() => {
    const { q, status, methodology, health, portfolioId } = this.query();
    return Boolean(q || status || methodology || health || portfolioId);
  });

  private readonly portfolioList = resource({
    params: () => this.session.activeOrganizationId(),
    loader: () => firstValueFrom(this.portfoliosApi.list({ size: 100, sort: ['name,asc'] })),
  });
  protected readonly portfolios = computed(() =>
    this.portfolioList.hasValue() ? this.portfolioList.value().content : [],
  );

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.store.load(this.query);
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(
      () => void this.queryParams.set({ q: value.trim(), page: null }),
      300,
    );
  }

  protected filter(
    name: 'status' | 'methodology' | 'health' | 'portfolioId',
    value: string | null,
  ): void {
    void this.queryParams.set({ [name]: value, page: null });
  }

  protected clearFilters(): void {
    void this.queryParams.set({
      q: null,
      status: null,
      methodology: null,
      health: null,
      portfolioId: null,
      page: null,
    });
  }

  protected onSort(sort: Sort): void {
    const direction = sort.direction === 'desc' ? 'desc' : 'asc';
    void this.queryParams.set({ sort: `${sort.active},${direction}`, page: null });
  }

  protected onPage(event: PageEvent): void {
    void this.queryParams.set({
      page: event.pageIndex || null,
      size: event.pageSize === 20 ? null : event.pageSize,
    });
  }
}
