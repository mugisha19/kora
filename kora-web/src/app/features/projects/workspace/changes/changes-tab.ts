import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { CHANGE_REQUEST_STATUSES } from '../../../../core/api/api.models';
import { ChangeRequestsApi } from '../../../../core/api/change-requests.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { QueryParams, intParam, oneOfParam } from '../../../../shared/routing/query-params';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import { ChangeFacade } from './change.facade';
import { ChangeStatusChip, SignedMoneyPipe, WaitingFor } from './change-look';

const PAGE_SIZES = [10, 20, 50];

/**
 * Changes tab (feature 14): the project's change requests, newest first, with their status and
 * who they wait for. Each opens its own page with the impact and the approval timeline.
 */
@Component({
  selector: 'kora-changes-tab',
  imports: [
    ChangeStatusChip,
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatFormField,
    MatIcon,
    MatLabel,
    MatOption,
    MatPaginator,
    MatSelect,
    MatSelectTrigger,
    RouterLink,
    SignedMoneyPipe,
    TranslocoPipe,
    WaitingFor,
  ],
  providers: [ChangeFacade, QueryParams],
  template: `
    <div class="filters">
      <mat-form-field class="filter" subscriptSizing="dynamic">
        <mat-label>{{ 'changes.fields.status' | transloco }}</mat-label>
        <mat-select
          [value]="statusFilter()"
          (selectionChange)="queryParams.set({ status: $event.value, page: null })"
        >
          <mat-select-trigger>{{
            'changeStatus.' + statusFilter() | transloco
          }}</mat-select-trigger>
          <mat-option [value]="null">{{ 'changes.anyStatus' | transloco }}</mat-option>
          @for (value of statuses; track value) {
            <mat-option [value]="value">{{ 'changeStatus.' + value | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <span class="spacer"></span>
      @if (facade.canDraft()) {
        <button mat-flat-button type="button" (click)="facade.draft()">
          <mat-icon svgIcon="add" aria-hidden="true" />
          {{ 'changes.draft' | transloco }}
        </button>
      }
    </div>

    <p class="count" role="status">
      @if (requests.hasValue()) {
        {{ 'changes.count' | transloco: { count: requests.value().totalElements } }}
      }
    </p>

    @if (requests.isLoading() && !requests.hasValue()) {
      <kora-loading-state />
    } @else if (requests.error()) {
      <kora-error-state (retry)="requests.reload()" />
    } @else if (!requests.value()?.content?.length) {
      <kora-empty-state
        icon="swap_horiz"
        [heading]="'changes.emptyTitle' | transloco"
        [message]="'changes.emptyMessage' | transloco"
      />
    } @else {
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">
            {{
              'workspace.tabs.change-requests' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'changes.fields.request' | transloco }}</th>
              <th scope="col">{{ 'changes.fields.status' | transloco }}</th>
              <th scope="col">{{ 'changes.fields.cost' | transloco }}</th>
              <th scope="col">{{ 'changes.fields.schedule' | transloco }}</th>
              <th scope="col">{{ 'changes.waitingFor' | transloco }}</th>
              <th scope="col">{{ 'changes.fields.requestedBy' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (request of requests.value()?.content ?? []; track request.id) {
              <tr>
                <th scope="row">
                  <a [routerLink]="request.id">
                    <span class="key">{{ request.key }}</span
                    >&ngsp;<span>{{ request.title }}</span>
                  </a>
                  <span class="secondary">
                    {{ 'changeType.' + request.type | transloco }}
                    @if (request.revision > 1) {
                      · {{ 'changes.revision' | transloco: { number: request.revision } }}
                    }
                  </span>
                </th>
                <td><kora-change-status [status]="request.status" /></td>
                <td class="num">
                  {{ (request.impact.costDelta | signedMoney: language.current()) || '—' }}
                </td>
                <td class="num">
                  @if (request.impact.scheduleDeltaDays) {
                    {{ 'changes.days' | transloco: { count: request.impact.scheduleDeltaDays } }}
                  } @else {
                    —
                  }
                </td>
                <td><kora-waiting-for [request]="request" /></td>
                <td>
                  {{ request.requestedBy.fullName }}
                  <span class="secondary">{{
                    request.createdAt | localizedDate: language.current()
                  }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <mat-paginator
        [length]="requests.value()?.totalElements ?? 0"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="pageSizes"
        (page)="onPage($event)"
      />
    }
  `,
  styleUrls: [
    '../../../../shared/ui/data-table.scss',
    '../governance-table.scss',
    './changes.scss',
  ],
})
export class ChangesTab {
  /** Query parameters (bound by the router). */
  readonly status = input<string>();
  readonly page = input<string>();
  readonly size = input<string>();

  protected readonly facade = inject(ChangeFacade);
  protected readonly queryParams = inject(QueryParams);
  protected readonly language = inject(LanguageService);
  private readonly project = inject(ProjectStore);
  private readonly api = inject(ChangeRequestsApi);

  protected readonly statuses = CHANGE_REQUEST_STATUSES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly statusFilter = computed(() =>
    oneOfParam(this.status(), CHANGE_REQUEST_STATUSES),
  );
  protected readonly pageIndex = computed(() => intParam(this.page(), 0));
  protected readonly pageSize = computed(() =>
    PAGE_SIZES.includes(intParam(this.size(), 20)) ? intParam(this.size(), 20) : 20,
  );

  protected readonly requests = resource({
    params: () => ({
      projectId: this.project.projectId() ?? '',
      status: this.statusFilter() ?? undefined,
      page: this.pageIndex(),
      size: this.pageSize(),
      version: this.facade.version(),
    }),
    loader: ({ params }) =>
      firstValueFrom(
        this.api.list(params.projectId, {
          status: params.status,
          page: params.page,
          size: params.size,
        }),
      ),
  });

  protected onPage(event: PageEvent): void {
    void this.queryParams.set({
      page: event.pageIndex || null,
      size: event.pageSize === 20 ? null : event.pageSize,
    });
  }
}
