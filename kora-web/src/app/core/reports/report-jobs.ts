import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { filter, firstValueFrom } from 'rxjs';
import { CreateReportRequest, ReportJob } from '../api/api.models';
import { ReportsApi } from '../api/reports.api';
import { FileDownloader } from '../files/file-downloader';
import { LiveUpdates } from '../live/live-updates';
import { Notifier } from '../notify/notifier';
import { SessionStore } from '../session/session.store';

/** How often waiting jobs are checked when no live notification says they're done. */
export const REPORT_POLL_MS = 3_000;

const waiting = (job: ReportJob) => job.status === 'QUEUED' || job.status === 'RUNNING';

/**
 * My report exports (feature 21): queue one, follow it until it's ready (the REPORT_READY
 * notification, with polling as a fallback) and download it through a fresh short-lived link.
 * A job queued in this session gets a toast when it's done.
 */
@Injectable({ providedIn: 'root' })
export class ReportJobs {
  private readonly api = inject(ReportsApi);
  private readonly session = inject(SessionStore);
  private readonly downloader = inject(FileDownloader);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);

  private readonly list = signal<ReportJob[] | null>(null);
  private readonly failed = signal(false);
  /** Jobs queued here, whose completion deserves a toast. */
  private readonly watched = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly jobs = this.list.asReadonly();
  readonly error = this.failed.asReadonly();
  readonly pending = computed(() => (this.list() ?? []).filter(waiting).length);

  constructor() {
    effect(() => {
      const organizationId = this.session.activeOrganizationId();
      untracked(() => {
        this.list.set(null);
        this.watched.clear();
        clearTimeout(this.timer);
        if (organizationId) void this.refresh();
      });
    });
    inject(LiveUpdates)
      .notifications$.pipe(filter((n) => n.type === 'REPORT_READY' || n.type === 'REPORT_FAILED'))
      .subscribe(() => void this.refresh());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  async refresh(): Promise<void> {
    try {
      const jobs = await firstValueFrom(this.api.list());
      const before = this.list();
      this.list.set(jobs);
      this.failed.set(false);
      for (const job of jobs) {
        const was = before?.find((j) => j.id === job.id);
        if (this.watched.has(job.id) && !waiting(job) && (!was || waiting(was))) {
          this.watched.delete(job.id);
          void this.announce(job);
        }
      }
    } catch {
      this.failed.set(true);
    }
    this.schedule();
  }

  /** Queues a report; rejects with the API's refusal (access, five waiting) for the caller. */
  async create(request: CreateReportRequest): Promise<ReportJob> {
    const job = await firstValueFrom(this.api.create(request));
    this.watched.add(job.id);
    this.list.update((list) => [job, ...(list ?? []).filter((j) => j.id !== job.id)]);
    this.schedule();
    return job;
  }

  /** Links last five minutes: ask for a fresh one each time. */
  async download(job: ReportJob): Promise<void> {
    const fresh = await firstValueFrom(this.api.get(job.id));
    if (fresh.downloadUrl) this.downloader.open(fresh.downloadUrl, fresh.fileName);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (!(this.list() ?? []).some(waiting)) return;
    this.timer = setTimeout(() => void this.refresh(), REPORT_POLL_MS);
  }

  private async announce(job: ReportJob): Promise<void> {
    const name = this.transloco.translate(`reportType.${job.type}`);
    if (job.status === 'FAILED') {
      this.notifier.error(this.transloco.translate('reports.failedToast', { name }));
      return;
    }
    const download = await this.notifier.withAction(
      this.transloco.translate('reports.readyToast', { name, format: job.format }),
      this.transloco.translate('reports.download'),
    );
    if (download) await this.download(job);
  }
}
