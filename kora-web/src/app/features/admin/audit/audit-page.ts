import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuditEvent, AuditVerification, ListAuditEventsQuery } from '../../../core/api/api.models';
import { AuditApi } from '../../../core/api/audit.api';
import { ChangeFormat } from '../../../core/audit/change-format';
import { FileDownloader } from '../../../core/files/file-downloader';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgDirectory } from '../../../core/people/org-directory';
import { QueryParams } from '../../../shared/routing/query-params';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { StatusChip } from '../../../shared/ui/status-chip';
import { auditCsv } from './audit-csv';

const PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Kinds of entries to filter by: a verb (any item) or denied access. */
export const AUDIT_KINDS = ['created', 'updated', 'deleted', 'denied'] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

/** Item types worth filtering by; any other still shows in the unfiltered log. */
export const AUDIT_ENTITY_TYPES = [
  'project',
  'task',
  'risk',
  'issue',
  'change-request',
  'stakeholder',
  'sprint',
  'wbs-node',
  'charter',
  'timesheet',
  'attachment',
  'membership',
  'invitation',
  'organization',
  'working-calendar',
  'cost-rate',
  'report-job',
] as const;

/**
 * Admin → Audit log (feature 19): the organization's append-only record, newest first, filtered by
 * person, item type, kind and dates (all in the URL). Each entry opens to its field-level changes;
 * the rows shown export to CSV; the hash chain can be checked for tampering.
 */
@Component({
  selector: 'kora-audit-page',
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
    MatSelect,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [QueryParams],
  template: `
    <div class="bar">
      <p class="kora-muted intro">{{ 'audit.intro' | transloco }}</p>
      <button mat-stroked-button type="button" [disabled]="verifying()" (click)="verify()">
        <mat-icon svgIcon="verified" aria-hidden="true" />
        {{ 'audit.verify' | transloco }}
      </button>
    </div>

    @if (verification(); as v) {
      <div class="kora-notice" [class.error]="!v.valid" role="status">
        <mat-icon [svgIcon]="v.valid ? 'verified' : 'warning'" aria-hidden="true" />
        <p>
          {{
            (v.valid ? 'audit.chainValid' : 'audit.chainBroken')
              | transloco: { checked: v.checked, id: v.firstBrokenId ?? '' }
          }}
        </p>
      </div>
    }

    <div class="filters">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'audit.person' | transloco }}</mat-label>
        <mat-select [value]="actor() ?? null" (selectionChange)="filter({ actor: $event.value })">
          <mat-option [value]="null">{{ 'audit.anyone' | transloco }}</mat-option>
          @for (m of directory.people(); track m.userId) {
            <mat-option [value]="m.userId">{{ m.fullName }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'audit.itemType' | transloco }}</mat-label>
        <mat-select
          [value]="entityType() ?? null"
          (selectionChange)="filter({ entityType: $event.value })"
        >
          <mat-option [value]="null">{{ 'audit.anyItem' | transloco }}</mat-option>
          @for (t of entityTypes; track t) {
            <mat-option [value]="t">{{ format.entityLabel(t) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'audit.kind' | transloco }}</mat-label>
        <mat-select [value]="kindFilter()" (selectionChange)="filter({ kind: $event.value })">
          <mat-option [value]="null">{{ 'audit.anyKind' | transloco }}</mat-option>
          @for (k of kinds; track k) {
            <mat-option [value]="k">{{ 'audit.kinds.' + k | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'audit.from' | transloco }}</mat-label>
        <input matInput type="date" [value]="fromDate() ?? ''" (change)="setDate('from', $event)" />
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'audit.to' | transloco }}</mat-label>
        <input matInput type="date" [value]="toDate() ?? ''" (change)="setDate('to', $event)" />
      </mat-form-field>
    </div>

    @if (state() === 'error' && !events().length) {
      <kora-error-state (retry)="load()" />
    } @else if (state() === 'loading' && !events().length) {
      <kora-loading-state />
    } @else if (!events().length) {
      <kora-empty-state
        icon="fact_check"
        [heading]="'audit.emptyTitle' | transloco"
        [message]="'audit.emptyMessage' | transloco"
      />
    } @else {
      <div class="tools">
        <span class="kora-muted">{{ 'audit.count' | transloco: { count: events().length } }}</span>
        <button mat-button type="button" (click)="exportCsv()">
          <mat-icon svgIcon="download" aria-hidden="true" />
          {{ 'audit.exportCsv' | transloco }}
        </button>
      </div>
      <div class="wrap" role="region" tabindex="0" [attr.aria-label]="'audit.logLabel' | transloco">
        <table>
          <caption class="visually-hidden">
            {{
              'audit.logLabel' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'audit.when' | transloco }}</th>
              <th scope="col">{{ 'audit.who' | transloco }}</th>
              <th scope="col">{{ 'audit.what' | transloco }}</th>
              <th scope="col">{{ 'audit.item' | transloco }}</th>
              <th scope="col">{{ 'audit.outcome' | transloco }}</th>
              <th scope="col">
                <span class="visually-hidden">{{ 'audit.details' | transloco }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (e of events(); track e.id) {
              <tr [class.denied]="e.outcome === 'DENIED'">
                <td>
                  <time [attr.datetime]="e.occurredAt">{{ when(e.occurredAt) }}</time>
                </td>
                <td>
                  {{ e.actor?.fullName ?? ('history.system' | transloco) }}
                  @if (e.actorIp) {
                    <span class="sub">{{ e.actorIp }}</span>
                  }
                </td>
                <td>{{ what(e) }}</td>
                <td class="item">{{ e.entityLabel ?? '—' }}</td>
                <td>
                  <kora-status-chip
                    [tone]="e.outcome === 'DENIED' ? 'danger' : 'success'"
                    [label]="'audit.outcomes.' + e.outcome | transloco"
                  />
                </td>
                <td>
                  <button
                    mat-button
                    type="button"
                    [attr.aria-expanded]="open() === e.id"
                    [attr.aria-controls]="'audit-' + e.id"
                    [attr.aria-label]="'audit.detailsFor' | transloco: { what: what(e) }"
                    (click)="toggle(e.id)"
                  >
                    {{ 'audit.details' | transloco }}
                  </button>
                </td>
              </tr>
              @if (open() === e.id) {
                <tr class="details">
                  <td colspan="6" [id]="'audit-' + e.id">
                    @if (lines(e).length) {
                      <table class="diff">
                        <caption class="visually-hidden">
                          {{
                            'audit.changesOf' | transloco: { what: what(e) }
                          }}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">{{ 'audit.field' | transloco }}</th>
                            <th scope="col">{{ 'audit.before' | transloco }}</th>
                            <th scope="col">{{ 'audit.after' | transloco }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (line of lines(e); track line.field) {
                            <tr>
                              <th scope="row">{{ line.label }}</th>
                              <td>{{ line.before ?? '—' }}</td>
                              <td>{{ line.after ?? '—' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @else {
                      <p class="kora-muted">{{ 'audit.noChanges' | transloco }}</p>
                    }
                    <dl class="facts">
                      @if (e.correlationId) {
                        <dt>{{ 'audit.reference' | transloco }}</dt>
                        <dd>
                          <code>{{ e.correlationId }}</code>
                        </dd>
                      }
                      @if (e.userAgent) {
                        <dt>{{ 'audit.browser' | transloco }}</dt>
                        <dd>{{ e.userAgent }}</dd>
                      }
                    </dl>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (cursor()) {
        <button
          mat-stroked-button
          type="button"
          class="more"
          [disabled]="loadingMore()"
          (click)="loadMore()"
        >
          {{ 'audit.more' | transloco }}
        </button>
      }
    }
  `,
  styles: `
    .bar,
    .tools {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--kora-space-2);
    }
    .intro {
      margin: 0;
    }
    .kora-notice {
      margin-block: var(--kora-space-3);
    }
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
      gap: var(--kora-space-2);
      margin-block: var(--kora-space-3);
    }
    .wrap {
      overflow-x: auto;
    }
    .wrap:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
    }
    table {
      inline-size: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th,
    td {
      padding: var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
      vertical-align: top;
    }
    thead th {
      font: var(--mat-sys-label-large);
      white-space: nowrap;
    }
    .sub {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .item {
      overflow-wrap: anywhere;
    }
    tr.denied td:first-child {
      border-inline-start: 4px solid var(--kora-danger-fg);
    }
    tr.details td {
      background: var(--mat-sys-surface-container-low);
    }
    .diff {
      font: var(--mat-sys-body-small);
    }
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--kora-space-1) var(--kora-space-3);
      margin: var(--kora-space-2) 0 0;
      font: var(--mat-sys-body-small);
    }
    .facts dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .more {
      margin-block-start: var(--kora-space-3);
    }
  `,
})
export class AuditPage {
  /** Query parameters (bound by the router). */
  readonly actor = input<string>();
  readonly entityType = input<string>();
  readonly kind = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();

  private readonly api = inject(AuditApi);
  private readonly query = inject(QueryParams);
  private readonly downloader = inject(FileDownloader);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  protected readonly directory = inject(OrgDirectory);
  protected readonly format = inject(ChangeFormat);

  protected readonly kinds = AUDIT_KINDS;
  protected readonly entityTypes = AUDIT_ENTITY_TYPES;
  protected readonly events = signal<AuditEvent[]>([]);
  protected readonly cursor = signal<string | undefined>(undefined);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadingMore = signal(false);
  protected readonly open = signal<string | null>(null);
  protected readonly verifying = signal(false);
  protected readonly verification = signal<AuditVerification | null>(null);

  protected readonly kindFilter = computed<AuditKind | null>(() =>
    AUDIT_KINDS.includes(this.kind() as AuditKind) ? (this.kind() as AuditKind) : null,
  );
  protected readonly fromDate = computed(() => (DATE.test(this.from() ?? '') ? this.from() : null));
  protected readonly toDate = computed(() => (DATE.test(this.to() ?? '') ? this.to() : null));

  /** The API filters by exact action: a kind becomes one when an item type is chosen too. */
  private readonly apiQuery = computed<ListAuditEventsQuery>(() => {
    const kind = this.kindFilter();
    const type = this.entityType();
    const action =
      kind === 'denied' ? 'access.denied' : kind && type ? `${type}.${kind}` : undefined;
    return {
      ...(this.actor() ? { actorId: this.actor() } : {}),
      ...(type && kind !== 'denied' ? { entityType: type } : {}),
      ...(action ? { action } : {}),
      ...(this.fromDate() ? { from: this.fromDate() ?? undefined } : {}),
      ...(this.toDate() ? { to: this.toDate() ?? undefined } : {}),
    };
  });

  constructor() {
    effect(() => {
      this.apiQuery();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.open.set(null);
    try {
      const page = await firstValueFrom(this.api.list({ ...this.apiQuery(), limit: PAGE_SIZE }));
      this.events.set(this.onlyKind(page.items));
      this.cursor.set(page.nextCursor);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (!cursor) return;
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(
        this.api.list({ ...this.apiQuery(), limit: PAGE_SIZE, cursor }),
      );
      this.events.update((list) => [...list, ...this.onlyKind(page.items)]);
      this.cursor.set(page.nextCursor);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected filter(change: Record<string, string | null>): void {
    void this.query.set(change);
  }

  protected setDate(which: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    void this.query.set({ [which]: DATE.test(value) ? value : null });
  }

  protected toggle(id: string): void {
    this.open.update((current) => (current === id ? null : id));
  }

  protected async verify(): Promise<void> {
    this.verifying.set(true);
    try {
      this.verification.set(await firstValueFrom(this.api.verify()));
    } finally {
      this.verifying.set(false);
    }
  }

  protected exportCsv(): void {
    const t = (key: string) => this.transloco.translate(key);
    const csv = auditCsv(this.events(), [
      t('audit.when'),
      t('audit.who'),
      t('audit.ip'),
      t('audit.actionColumn'),
      t('audit.itemType'),
      t('audit.item'),
      t('audit.itemId'),
      t('audit.outcome'),
      t('audit.changes'),
      t('audit.reference'),
    ]);
    this.downloader.save(
      csv,
      `audit-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
    );
  }

  /** "Task changed", "Access denied". */
  protected what(e: AuditEvent): string {
    if (e.outcome === 'DENIED') return this.transloco.translate('audit.kinds.denied');
    const verb = e.action.slice(e.action.lastIndexOf('.') + 1);
    return this.transloco.translate(`audit.action.${verb}`, {
      type: this.format.entityLabel(e.entityType),
    });
  }

  protected lines(e: AuditEvent) {
    return this.format.lines(e.changes);
  }

  protected when(iso: string): string {
    return new Intl.DateTimeFormat(this.language.current(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  /** A kind without an item type: the verb is filtered here (the API filters exact actions). */
  private onlyKind(items: AuditEvent[]): AuditEvent[] {
    const kind = this.kindFilter();
    if (!kind || kind === 'denied' || this.entityType()) return items;
    return items.filter((e) => e.outcome === 'SUCCESS' && e.action.endsWith(`.${kind}`));
  }
}
