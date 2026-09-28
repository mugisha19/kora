import { Component, computed, inject, input, resource } from '@angular/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { MatSort, MatSortHeader, Sort } from '@angular/material/sort';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DASHBOARD_SORT_FIELDS, HEALTHS, PROJECT_STATUSES } from '../../core/api/api.models';
import { toApiError } from '../../core/api/api-error';
import { DashboardApi } from '../../core/api/dashboard.api';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { EvmApi } from '../../core/api/evm.api';
import { RisksApi } from '../../core/api/risks.api';
import { SeverityChip } from '../../shared/ui/severity-chip';
import { LanguageService } from '../../core/i18n/language.service';
import { SessionStore } from '../../core/session/session.store';
import { LocalizedDatePipe } from '../../shared/forms/localized-date.pipe';
import { MoneyPipe, Percent100Pipe } from '../../shared/format/money';
import { QueryParams, intParam, oneOfParam } from '../../shared/routing/query-params';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { HEALTH_LOOK, HealthChip, PROJECT_STATUS_LOOK } from '../../shared/ui/health-chip';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { DistributionChart, Slice } from './distribution-chart';
import { TrendChart } from './trend-chart';
import { ExportMenu } from '../reports/export-menu';

const PAGE_SIZE = 10;
type SortField = (typeof DASHBOARD_SORT_FIELDS)[number];

/**
 * `/dashboard` (feature 05): "which projects need attention, and why?" KPIs, health and status
 * distributions (charts with table alternatives), and the projects sorted worst first. The
 * portfolio and health filters, sort and page live in the URL so a view can be shared. Figures
 * that need later features (SPI, CPI, risks, change requests) show "—" until the API sends them.
 */
@Component({
  selector: 'kora-dashboard-page',
  imports: [
    ExportMenu,
    DistributionChart,
    EmptyState,
    ErrorState,
    HealthChip,
    LoadingState,
    LocalizedDatePipe,
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatFormField,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatLabel,
    MatOption,
    MatPaginator,
    MatRow,
    MatRowDef,
    MatSelect,
    MatSelectTrigger,
    MatSort,
    MatSortHeader,
    MatTable,
    MoneyPipe,
    PageHeader,
    Percent100Pipe,
    RouterLink,
    SeverityChip,
    TranslocoPipe,
    TrendChart,
  ],
  providers: [QueryParams],
  templateUrl: './dashboard-page.html',
  styleUrls: ['../../shared/ui/data-table.scss', './dashboard-page.scss'],
})
export class DashboardPage {
  /** Query parameters (bound by the router). */
  readonly portfolioId = input<string>();
  readonly health = input<string>();
  readonly sort = input<string>();
  readonly page = input<string>();

  private readonly api = inject(DashboardApi);
  private readonly portfoliosApi = inject(PortfoliosApi);
  private readonly risksApi = inject(RisksApi);
  private readonly evmApi = inject(EvmApi);
  private readonly session = inject(SessionStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = inject(LanguageService);
  protected readonly query = inject(QueryParams);

  protected readonly healths = HEALTHS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly columns = [
    'code',
    'name',
    'health',
    'percentComplete',
    'targetEndDate',
    'nextMilestone',
    'spi',
    'cpi',
  ];

  protected readonly portfolioFilter = computed(() => this.portfolioId() || undefined);
  protected readonly exportParams = computed(() => {
    const portfolioId = this.portfolioFilter();
    return portfolioId ? { portfolioId } : {};
  });
  protected readonly healthFilter = computed(() => oneOfParam(this.health(), HEALTHS));
  /** No sort in the URL = the API's default, worst health first. */
  protected readonly sortField = computed<SortField | null>(() =>
    oneOfParam(this.sort()?.split(',')[0], DASHBOARD_SORT_FIELDS),
  );
  protected readonly sortDirection = computed(() =>
    this.sort()?.split(',')[1] === 'desc' ? 'desc' : 'asc',
  );
  protected readonly pageIndex = computed(() => intParam(this.page(), 0));

  private readonly org = computed(() => this.session.activeOrganizationId());

  protected readonly summary = resource({
    params: () => ({ portfolioId: this.portfolioFilter(), org: this.org() }),
    loader: ({ params }) => firstValueFrom(this.api.summary(params.portfolioId)),
  });

  /** Monthly SPI and CPI of the projects in view (feature 17). */
  protected readonly trends = resource({
    params: () => ({ portfolioId: this.portfolioFilter(), org: this.org() }),
    loader: ({ params }) => firstValueFrom(this.evmApi.trends(6, params.portfolioId)),
  });

  /** Open critical risks (15+) across the projects in view (feature 11's portfolio view). */
  protected readonly criticalRisks = resource({
    params: () => ({ portfolioId: this.portfolioFilter(), org: this.org() }),
    loader: ({ params }) =>
      firstValueFrom(this.risksApi.portfolio({ portfolioId: params.portfolioId, size: 10 })),
  });

  protected readonly rows = resource({
    params: () => ({
      portfolioId: this.portfolioFilter(),
      health: this.healthFilter() ?? undefined,
      sort: this.sortField() ? [`${this.sortField()},${this.sortDirection()}`] : undefined,
      page: this.pageIndex(),
      org: this.org(),
    }),
    loader: ({ params: { portfolioId, health, sort, page } }) =>
      firstValueFrom(this.api.projects({ portfolioId, health, sort, page, size: PAGE_SIZE })),
  });

  private readonly portfolioList = resource({
    params: () => this.org(),
    loader: () => firstValueFrom(this.portfoliosApi.list({ size: 100, sort: ['name,asc'] })),
  });
  protected readonly portfolios = computed(() =>
    this.portfolioList.hasValue() ? this.portfolioList.value().content : [],
  );

  /** Re-translate chart labels when the language changes. */
  private readonly lang = toSignal(this.transloco.langChanges$);

  protected readonly kpis = computed(() => {
    if (!this.summary.hasValue()) return null;
    const s = this.summary.value();
    const count = (record: Record<string, number | undefined>, key: string) => record[key] ?? 0;
    const active = ['APPROVED', 'IN_PROGRESS', 'ON_HOLD', 'CLOSING'].reduce(
      (total, status) => total + count(s.byStatus, status),
      0,
    );
    const rated = ['GREEN', 'AMBER', 'RED'].reduce((t, h) => t + count(s.byHealth, h), 0);
    return {
      summary: s,
      active,
      onTrack: rated ? (count(s.byHealth, 'GREEN') / rated) * 100 : null,
    };
  });

  protected readonly healthSlices = computed<Slice[]>(() => {
    this.lang();
    const byHealth: Record<string, number | undefined> = this.summary.hasValue()
      ? this.summary.value().byHealth
      : {};
    return HEALTHS.map((key) => ({
      key,
      label: this.transloco.translate(`health.${key}`),
      count: byHealth[key] ?? 0,
      tone: HEALTH_LOOK[key].tone,
    }));
  });

  protected readonly statusSlices = computed<Slice[]>(() => {
    this.lang();
    const byStatus: Record<string, number | undefined> = this.summary.hasValue()
      ? this.summary.value().byStatus
      : {};
    return PROJECT_STATUSES.map((key) => ({
      key,
      label: this.transloco.translate(`projectStatus.${key}`),
      count: byStatus[key] ?? 0,
      tone: PROJECT_STATUS_LOOK[key].tone,
    }));
  });

  protected readonly summaryErrorId = computed(() => {
    const error = this.summary.error();
    return error ? toApiError(error).correlationId : undefined;
  });
  protected readonly rowsErrorId = computed(() => {
    const error = this.rows.error();
    return error ? toApiError(error).correlationId : undefined;
  });

  protected ratio(value: number | undefined): string {
    return value === undefined
      ? '—'
      : new Intl.NumberFormat(this.language.current(), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
  }

  protected onSort(sort: Sort): void {
    void this.query.set({
      sort: sort.direction ? `${sort.active},${sort.direction}` : null,
      page: null,
    });
  }

  protected onPage(event: PageEvent): void {
    void this.query.set({ page: event.pageIndex || null });
  }
}
