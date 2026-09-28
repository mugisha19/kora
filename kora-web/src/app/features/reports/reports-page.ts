import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  REPORT_FORMATS,
  REPORT_TYPES,
  REPORTS_MAX_PENDING,
  ReportFormat,
  ReportParams,
  ReportStatus,
  ReportType,
} from '../../core/api/api.models';
import { toApiError } from '../../core/api/api-error';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { ProjectsApi } from '../../core/api/projects.api';
import { ErrorMessages } from '../../core/errors/error-messages';
import { LanguageService } from '../../core/i18n/language.service';
import { ReportJobs } from '../../core/reports/report-jobs';
import { formatFileSize } from '../../shared/format/file-size';
import { relativeTime } from '../../shared/format/relative-time';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusChip, StatusTone } from '../../shared/ui/status-chip';

/** Reports made for one project; the others cover a portfolio, or everything I can see. */
const FOR_PROJECT: readonly ReportType[] = ['PROJECT_STATUS', 'EVM', 'TIMESHEETS'];
const FOR_PORTFOLIO: readonly ReportType[] = ['PORTFOLIO_SUMMARY', 'RISK_REGISTER'];

export const REPORT_STATUS_LOOK: Record<ReportStatus, { tone: StatusTone; icon: string }> = {
  QUEUED: { tone: 'neutral', icon: 'schedule' },
  RUNNING: { tone: 'info', icon: 'refresh' },
  READY: { tone: 'success', icon: 'check_circle' },
  FAILED: { tone: 'danger', icon: 'error' },
};

/**
 * `/reports` (feature 21): make a report, and my last 50 with their progress, download links
 * (fresh on each click) and why one failed. Files are kept seven days.
 */
@Component({
  selector: 'kora-reports-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatFormField,
    MatHint,
    MatIcon,
    MatLabel,
    MatOption,
    MatProgressBar,
    MatSelect,
    PageHeader,
    StatusChip,
    TranslocoPipe,
  ],
  template: `
    <kora-page-header
      [heading]="'reports.title' | transloco"
      [subtitle]="'reports.subtitle' | transloco"
    />

    <section class="new" aria-labelledby="new-title">
      <h2 id="new-title">{{ 'reports.new' | transloco }}</h2>
      @if (formError()) {
        <div class="kora-notice error" role="alert">
          <mat-icon svgIcon="error" aria-hidden="true" />
          <p>{{ formError() }}</p>
        </div>
      }
      <div class="fields">
        <mat-form-field>
          <mat-label>{{ 'reports.type' | transloco }}</mat-label>
          <mat-select [value]="type()" (selectionChange)="chooseType($event.value)">
            @for (t of types; track t) {
              <mat-option [value]="t">{{ 'reportTypeTitle.' + t | transloco }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ 'reportTypeHint.' + type() | transloco }}</mat-hint>
        </mat-form-field>
        @if (needsProject()) {
          <mat-form-field>
            <mat-label>{{ 'reports.project' | transloco }}</mat-label>
            <mat-select [value]="projectId()" (selectionChange)="projectId.set($event.value)">
              @for (p of projects.value() ?? []; track p.id) {
                <mat-option [value]="p.id">{{ p.code }} · {{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>{{ 'reports.portfolio' | transloco }}</mat-label>
            <mat-select [value]="portfolioId()" (selectionChange)="portfolioId.set($event.value)">
              <mat-option [value]="null">{{ 'reports.allVisible' | transloco }}</mat-option>
              @for (p of portfolios.value() ?? []; track p.id) {
                <mat-option [value]="p.id">{{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>{{ 'reports.format' | transloco }}</mat-label>
          <mat-select [value]="format()" (selectionChange)="format.set($event.value)">
            @for (f of formats; track f) {
              <mat-option [value]="f">{{ 'reports.formatChoice.' + f | transloco }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <div class="actions">
        <span class="kora-muted">{{
          'reports.pendingCount' | transloco: { count: jobs.pending(), max: maxPending }
        }}</span>
        <button
          mat-flat-button
          type="button"
          [disabled]="creating() || (needsProject() && !projectId())"
          (click)="create()"
        >
          {{ 'reports.make' | transloco }}
        </button>
      </div>
    </section>

    <section aria-labelledby="mine-title">
      <h2 id="mine-title">{{ 'reports.mine' | transloco }}</h2>
      @if (jobs.error() && !jobs.jobs()) {
        <kora-error-state (retry)="jobs.refresh()" />
      } @else if (jobs.jobs(); as list) {
        @if (list.length) {
          <ul class="jobs">
            @for (job of list; track job.id) {
              <li>
                <div class="main">
                  <strong>{{ 'reportTypeTitle.' + job.type | transloco }}</strong>
                  <kora-status-chip
                    [tone]="look[job.status].tone"
                    [icon]="look[job.status].icon"
                    [label]="'reportStatus.' + job.status | transloco"
                  />
                </div>
                <p class="meta">
                  {{ job.format === 'PDF' ? 'PDF' : 'Excel' }} ·
                  {{ 'reports.requested' | transloco: { when: ago(job.createdAt) } }}
                  @if (job.status === 'READY' && job.sizeBytes) {
                    · {{ size(job.sizeBytes) }}
                  }
                  @if (job.expiresAt) {
                    · {{ 'reports.keptUntil' | transloco: { date: date(job.expiresAt) } }}
                  }
                </p>
                @if (job.status === 'QUEUED' || job.status === 'RUNNING') {
                  <mat-progress-bar
                    mode="indeterminate"
                    [attr.aria-label]="'reportStatus.' + job.status | transloco"
                  />
                }
                @if (job.status === 'FAILED') {
                  <p class="failure">
                    <mat-icon svgIcon="error" aria-hidden="true" />
                    {{ job.failureReason ?? ('reports.failedGeneric' | transloco) }}
                  </p>
                }
                @if (job.status === 'READY') {
                  <button mat-stroked-button type="button" (click)="jobs.download(job)">
                    <mat-icon svgIcon="download" aria-hidden="true" />
                    {{ 'reports.downloadFile' | transloco: { name: job.fileName ?? '' } }}
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <kora-empty-state
            icon="summarize"
            [heading]="'reports.emptyTitle' | transloco"
            [message]="'reports.emptyMessage' | transloco"
          />
        }
      } @else {
        <kora-loading-state />
      }
    </section>
  `,
  styles: `
    h2 {
      margin: var(--kora-space-4) 0 var(--kora-space-2);
      font: var(--mat-sys-title-medium);
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: var(--kora-space-2) var(--kora-space-3);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--kora-space-2);
      margin-block-start: var(--kora-space-2);
    }
    .jobs {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .jobs li {
      display: flex;
      flex-direction: column;
      gap: var(--kora-space-1);
      padding-block: var(--kora-space-3);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    .jobs li button {
      align-self: flex-start;
    }
    .main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kora-space-2);
    }
    .meta {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .failure {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      margin: 0;
      color: var(--kora-danger-fg);
    }
  `,
})
export class ReportsPage {
  protected readonly jobs = inject(ReportJobs);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly portfoliosApi = inject(PortfoliosApi);
  private readonly messages = inject(ErrorMessages);
  private readonly language = inject(LanguageService);

  protected readonly types = REPORT_TYPES;
  protected readonly formats = REPORT_FORMATS;
  protected readonly look = REPORT_STATUS_LOOK;
  protected readonly maxPending = REPORTS_MAX_PENDING;

  protected readonly type = signal<ReportType>('PROJECT_STATUS');
  protected readonly format = signal<ReportFormat>('PDF');
  protected readonly projectId = signal<string | null>(null);
  protected readonly portfolioId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly needsProject = computed(() => FOR_PROJECT.includes(this.type()));

  protected readonly projects = resource({
    loader: () =>
      firstValueFrom(this.projectsApi.list({ size: 100, sort: ['code,asc'] })).then(
        (page) => page.content,
      ),
  });
  protected readonly portfolios = resource({
    loader: () =>
      firstValueFrom(this.portfoliosApi.list({ size: 100 })).then((page) => page.content),
  });

  constructor() {
    void this.jobs.refresh();
  }

  protected chooseType(type: ReportType): void {
    this.type.set(type);
    this.formError.set(null);
    if (!FOR_PORTFOLIO.includes(type)) this.portfolioId.set(null);
  }

  protected async create(): Promise<void> {
    const params: ReportParams = this.needsProject()
      ? { projectId: this.projectId() ?? undefined }
      : this.portfolioId()
        ? { portfolioId: this.portfolioId() ?? undefined }
        : {};
    this.creating.set(true);
    this.formError.set(null);
    try {
      await this.jobs.create({ type: this.type(), format: this.format(), params });
    } catch (error: unknown) {
      this.formError.set(this.messages.message(toApiError(error)));
    } finally {
      this.creating.set(false);
    }
  }

  protected ago(iso: string): string {
    return relativeTime(iso, this.language.current());
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.language.current(), { dateStyle: 'medium' }).format(
      new Date(iso),
    );
  }

  protected size(bytes: number): string {
    return formatFileSize(bytes, this.language.current());
  }
}
