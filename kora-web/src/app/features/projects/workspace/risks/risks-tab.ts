import { Component, Injector, computed, inject, input, resource } from '@angular/core';
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
  ListRisksQuery,
  RISK_CATEGORIES,
  RISK_KINDS,
  RISK_SORT_FIELDS,
  RISK_STATUSES,
  Risk,
} from '../../../../core/api/api.models';
import { RisksApi } from '../../../../core/api/risks.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { QueryParams, intParam, oneOfParam } from '../../../../shared/routing/query-params';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { SeverityChip } from '../governance-look';
import { ProjectStore } from '../project.store';
import { RiskFacade } from './risk.facade';
import { RiskHeatmap, cellId } from './risk-heatmap';

type SortField = (typeof RISK_SORT_FIELDS)[number];
const PAGE_SIZES = [10, 20, 50];
/** Each sort's natural direction: highest score, nearest review, newest first. */
const SORTS: Record<SortField, string> = {
  score: 'score,desc',
  key: 'key,asc',
  reviewDate: 'reviewDate,asc',
  createdAt: 'createdAt,desc',
};

/**
 * Risks tab (feature 11): the heat map of open risks next to the register. Filters, sort, page
 * and the chosen heat map cell live in the URL; a risk opens in a side sheet at /risks/<id>.
 */
@Component({
  selector: 'kora-risks-tab',
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
    RiskHeatmap,
    RouterOutlet,
    SeverityChip,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [RiskFacade, QueryParams],
  templateUrl: './risks-tab.html',
  styleUrls: [
    '../../../../shared/ui/data-table.scss',
    '../governance-table.scss',
    './risks-tab.scss',
  ],
})
export class RisksTab {
  /** Query parameters (bound by the router). */
  readonly q = input<string>();
  readonly kind = input<string>();
  readonly category = input<string>();
  readonly status = input<string>();
  readonly owner = input<string>();
  readonly sort = input<string>();
  readonly page = input<string>();
  readonly size = input<string>();
  readonly cell = input<string>();

  protected readonly project = inject(ProjectStore);
  protected readonly facade = inject(RiskFacade);
  protected readonly language = inject(LanguageService);
  protected readonly queryParams = inject(QueryParams);
  private readonly api = inject(RisksApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly injector = inject(Injector);

  protected readonly kinds = RISK_KINDS;
  protected readonly categories = RISK_CATEGORIES;
  protected readonly statuses = RISK_STATUSES;
  protected readonly sortFields = RISK_SORT_FIELDS;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly sortField = computed<SortField>(
    () => oneOfParam(this.sort(), RISK_SORT_FIELDS) ?? 'score',
  );
  /** The URL, validated, as an API query. */
  protected readonly query = computed<ListRisksQuery>(() => ({
    q: this.q()?.trim() || undefined,
    kind: oneOfParam(this.kind(), RISK_KINDS) ?? undefined,
    category: oneOfParam(this.category(), RISK_CATEGORIES) ?? undefined,
    status: oneOfParam(this.status(), RISK_STATUSES) ?? undefined,
    ownerId: this.owner() || undefined,
    page: intParam(this.page(), 0),
    size: PAGE_SIZES.includes(intParam(this.size(), 20)) ? intParam(this.size(), 20) : 20,
    sort: [SORTS[this.sortField()]],
  }));
  protected readonly filtered = computed(() => {
    const { q, kind, category, status, ownerId } = this.query();
    return Boolean(q || kind || category || status || ownerId || this.cell());
  });

  protected readonly heatmap = resource({
    params: () => ({
      projectId: this.project.projectId() ?? '',
      kind: this.query().kind,
      category: this.query().category,
      ownerId: this.query().ownerId,
      version: this.facade.version(),
    }),
    loader: ({ params }) =>
      firstValueFrom(
        this.api.heatmap(params.projectId, {
          kind: params.kind,
          category: params.category,
          ownerId: params.ownerId,
        }),
      ),
  });

  /** The chosen heat map cell's risks, when one is chosen. */
  protected readonly cellRisks = computed(() => {
    const chosen = this.cell();
    if (!chosen || !this.heatmap.hasValue()) return null;
    const cell = this.heatmap.value().cells.find((c) => cellId(c) === chosen);
    return cell ? new Set(cell.riskIds) : new Set<string>();
  });

  protected readonly register = resource({
    params: () => ({
      projectId: this.project.projectId() ?? '',
      // A heat map cell shows every matching risk on one page.
      query: this.cell() ? { ...this.query(), page: 0, size: 100 } : this.query(),
      version: this.facade.version(),
    }),
    loader: ({ params }) => firstValueFrom(this.api.list(params.projectId, params.query)),
  });

  protected readonly risks = computed<Risk[]>(() => {
    if (!this.register.hasValue()) return [];
    const ids = this.cellRisks();
    const content = this.register.value().content;
    return ids ? content.filter((r) => ids.has(r.id)) : content;
  });
  protected readonly total = computed(() =>
    this.cellRisks() ? this.risks().length : (this.register.value()?.totalElements ?? 0),
  );

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

  protected clearFilters(): void {
    void this.queryParams.set({
      q: null,
      kind: null,
      category: null,
      status: null,
      owner: null,
      cell: null,
      page: null,
    });
  }

  protected onPage(event: PageEvent): void {
    void this.queryParams.set({
      page: event.pageIndex || null,
      size: event.pageSize === 20 ? null : event.pageSize,
    });
  }

  protected open(risk: Risk): void {
    void this.router.navigate([risk.id], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
    });
  }

  protected async raise(): Promise<void> {
    const risk = await this.facade.raise();
    if (risk) this.open(risk);
  }
}
