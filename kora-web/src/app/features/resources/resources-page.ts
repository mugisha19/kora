import { Component, Injector, computed, inject, input, resource, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { UserRef } from '../../core/api/api.models';
import { ProjectsApi } from '../../core/api/projects.api';
import { ResourcesApi } from '../../core/api/resources.api';
import { OrgClock } from '../../core/session/org-clock';
import { SessionStore } from '../../core/session/session.store';
import { mondayOf, plusDays } from '../../shared/format/iso-week';
import { QueryParams, intParam } from '../../shared/routing/query-params';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { sideSheet } from '../../shared/ui/side-sheet';
import { PersonSheet, PersonSheetData } from './person-sheet';
import { BAND_ICON } from '../../shared/ui/time-look';
import { ResourceHeatmap } from './resource-heatmap';

const WEEK_COUNTS = [4, 8, 12, 26];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `/resources` (feature 16): the capacity heat map of the organization's people (managers see
 * everyone, others themselves), for a range of weeks and optionally one project's team, all in
 * the URL. A person opens their capacity, leave and (for the PMO and admins) cost rates.
 */
@Component({
  selector: 'kora-resources-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    PageHeader,
    ResourceHeatmap,
    TranslocoPipe,
  ],
  providers: [QueryParams],
  template: `
    <kora-page-header
      [heading]="'resources.title' | transloco"
      [subtitle]="'resources.subtitle' | transloco"
    />

    <div class="filters">
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'resources.startingWeek' | transloco }}</mat-label>
        <input matInput type="date" [value]="start()" (change)="setFrom($event)" />
      </mat-form-field>
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'resources.weeks' | transloco }}</mat-label>
        <mat-select
          [value]="weekCount()"
          (selectionChange)="query.set({ weeks: $event.value === 12 ? null : $event.value })"
        >
          @for (count of weekCounts; track count) {
            <mat-option [value]="count">{{
              'resources.weekCount' | transloco: { count }
            }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (planner()) {
        <mat-form-field class="filter" subscriptSizing="dynamic">
          <mat-label>{{ 'resources.team' | transloco }}</mat-label>
          <mat-select
            [value]="project() ?? null"
            (selectionChange)="query.set({ project: $event.value })"
          >
            <mat-option [value]="null">{{ 'resources.everyone' | transloco }}</mat-option>
            @for (p of projects.value() ?? []; track p.id) {
              <mat-option [value]="p.id">{{ p.code }} · {{ p.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>

    <ul class="legend" [attr.aria-label]="'resources.legend' | transloco">
      @for (band of bands; track band) {
        <li [class]="'band-' + band.toLowerCase()">
          <mat-icon [svgIcon]="icons[band]" aria-hidden="true" />
          <strong>{{ 'utilizationBand.' + band | transloco }}</strong>
          {{ 'utilizationBandRule.' + band | transloco }}
        </li>
      }
    </ul>

    @if (heatmap.error()) {
      <kora-error-state (retry)="heatmap.reload()" />
    } @else if (heatmap.value(); as map) {
      @if (map.people.length) {
        <kora-resource-heatmap [data]="map" (opened)="open($event)" />
        <p class="kora-muted help">{{ 'resources.help' | transloco }}</p>
      } @else {
        <kora-empty-state
          icon="group"
          [heading]="'resources.emptyTitle' | transloco"
          [message]="'resources.emptyMessage' | transloco"
        />
      }
    } @else {
      <kora-loading-state />
    }
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-3);
      margin-block-end: var(--kora-space-3);
    }
    .filter {
      flex: 0 1 220px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
      margin: 0 0 var(--kora-space-3);
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
    }
    .legend li {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      padding: 2px var(--kora-space-2);
      border-radius: 999px;
    }
    .legend mat-icon {
      inline-size: 16px;
      block-size: 16px;
    }
    .band-under {
      color: var(--kora-info-fg);
      background: var(--kora-info-bg);
    }
    .band-healthy {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
    .band-over {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
    }
    .help {
      margin-block-start: var(--kora-space-2);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ResourcesPage {
  /** Query parameters (bound by the router). */
  readonly from = input<string>();
  readonly weeks = input<string>();
  readonly project = input<string>();

  protected readonly query = inject(QueryParams);
  private readonly api = inject(ResourcesApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly session = inject(SessionStore);
  private readonly clock = inject(OrgClock);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  protected readonly weekCounts = WEEK_COUNTS;
  protected readonly bands = ['UNDER', 'HEALTHY', 'OVER'] as const;
  protected readonly icons = BAND_ICON;
  /** Managers see everyone and filter by team. */
  protected readonly planner = computed(() =>
    ['ORG_ADMIN', 'PMO', 'PROJECT_MANAGER'].includes(this.session.activeRole() ?? ''),
  );
  protected readonly start = computed(() =>
    mondayOf(DATE.test(this.from() ?? '') ? (this.from() as string) : this.clock.today()),
  );
  protected readonly weekCount = computed(() => {
    const count = intParam(this.weeks(), 12);
    return WEEK_COUNTS.includes(count) ? count : 12;
  });
  /** Bumped after a change in a person's sheet. */
  private readonly version = signal(0);

  protected readonly heatmap = resource({
    params: () => ({
      from: this.start(),
      to: plusDays(this.start(), (this.weekCount() - 1) * 7),
      projectId: this.project() || undefined,
      version: this.version(),
    }),
    loader: ({ params }) =>
      firstValueFrom(
        this.api.heatmap({ from: params.from, to: params.to, projectId: params.projectId }),
      ),
  });
  protected readonly projects = resource({
    params: () => (this.planner() ? true : undefined),
    loader: async () =>
      (
        await firstValueFrom(
          this.projectsApi.list({ status: 'IN_PROGRESS', size: 100, sort: ['code,asc'] }),
        )
      ).content,
  });

  protected setFrom(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    void this.query.set({ from: DATE.test(value) ? mondayOf(value) : null });
  }

  protected open(user: UserRef): void {
    this.dialog.open<PersonSheet, PersonSheetData>(
      PersonSheet,
      sideSheet({ user, changed: () => this.version.update((v) => v + 1) }, this.injector),
    );
  }
}
