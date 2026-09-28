import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  Issue,
  ListIssuesQuery,
} from '../../../../core/api/api.models';
import { IssuesApi } from '../../../../core/api/issues.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { QueryParams, intParam, oneOfParam } from '../../../../shared/routing/query-params';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { ChangeFacade } from '../changes/change.facade';
import { ISSUE_STATUS_LOOK } from '../governance-look';
import { ProjectStore } from '../project.store';
import { PriorityChip } from '../work/task-look';
import { IssueFacade } from './issue.facade';
import { refreshOnActivity } from '../live-refresh';

const PAGE_SIZES = [10, 20, 50];

/**
 * Issues tab (feature 12): the issue log, most urgent first, with quick filters (mine, overdue,
 * critical) and overdue and escalated issues marked with an icon and a word. Filters live in the
 * URL; an issue opens in a side sheet at /issues/<id>.
 */
@Component({
  selector: 'kora-issues-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
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
    PriorityChip,
    RouterOutlet,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [IssueFacade, ChangeFacade, QueryParams],
  templateUrl: './issues-tab.html',
  styleUrls: ['../../../../shared/ui/data-table.scss', '../governance-table.scss', './issues.scss'],
})
export class IssuesTab {
  /** Query parameters (bound by the router). */
  readonly q = input<string>();
  readonly status = input<string>();
  readonly priority = input<string>();
  readonly mine = input<string>();
  readonly overdue = input<string>();
  readonly page = input<string>();
  readonly size = input<string>();

  protected readonly project = inject(ProjectStore);
  protected readonly facade = inject(IssueFacade);

  constructor() {
    refreshOnActivity(['issue'], () => this.facade.version.update((v) => v + 1));
  }

  protected readonly queryParams = inject(QueryParams);
  protected readonly language = inject(LanguageService);
  private readonly api = inject(IssuesApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statuses = ISSUE_STATUSES;
  protected readonly priorities = ISSUE_PRIORITIES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly statusLook = ISSUE_STATUS_LOOK;

  protected readonly query = computed<ListIssuesQuery>(() => ({
    q: this.q()?.trim() || undefined,
    status: oneOfParam(this.status(), ISSUE_STATUSES) ?? undefined,
    priority: oneOfParam(this.priority(), ISSUE_PRIORITIES) ?? undefined,
    ownerId: this.mine() === 'true' ? this.project.myUserId() : undefined,
    overdue: this.overdue() === 'true' ? true : undefined,
    page: intParam(this.page(), 0),
    size: PAGE_SIZES.includes(intParam(this.size(), 20)) ? intParam(this.size(), 20) : 20,
  }));
  protected readonly filtered = computed(() => {
    const { q, status, priority, ownerId, overdue } = this.query();
    return Boolean(q || status || priority || ownerId || overdue);
  });

  protected readonly issues = resource({
    params: () => ({
      projectId: this.project.projectId() ?? '',
      query: this.query(),
      version: this.facade.version(),
    }),
    loader: ({ params }) => firstValueFrom(this.api.list(params.projectId, params.query)),
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(
      () => void this.queryParams.set({ q: value.trim(), page: null }),
      300,
    );
  }

  protected filter(name: string, value: string | null): void {
    void this.queryParams.set({ [name]: value, page: null });
  }

  /** Quick filters are toggles: on sets the parameter, off removes it. */
  protected toggle(name: 'mine' | 'overdue', on: boolean): void {
    this.filter(name, on ? 'true' : null);
  }

  protected toggleCritical(): void {
    this.filter('priority', this.query().priority === 'CRITICAL' ? null : 'CRITICAL');
  }

  protected clearFilters(): void {
    void this.queryParams.set({
      q: null,
      status: null,
      priority: null,
      mine: null,
      overdue: null,
      page: null,
    });
  }

  protected onPage(event: PageEvent): void {
    void this.queryParams.set({
      page: event.pageIndex || null,
      size: event.pageSize === 20 ? null : event.pageSize,
    });
  }

  protected open(issue: Issue): void {
    void this.router.navigate([issue.id], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
    });
  }

  protected async raise(): Promise<void> {
    const issue = await this.facade.raise();
    if (issue) this.open(issue);
  }
}
