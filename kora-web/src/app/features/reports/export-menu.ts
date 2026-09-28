import { Component, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ReportFormat, ReportParams, ReportType } from '../../core/api/api.models';
import { toApiError } from '../../core/api/api-error';
import { ErrorMessages } from '../../core/errors/error-messages';
import { Notifier } from '../../core/notify/notifier';
import { ReportJobs } from '../../core/reports/report-jobs';

/**
 * "Export" on a page (feature 21): PDF for reading or Excel for analysis. The report is made in the
 * background; a toast links to My reports and another says when it's ready.
 */
@Component({
  selector: 'kora-export-menu',
  imports: [MatButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, TranslocoPipe],
  template: `
    <button
      mat-stroked-button
      type="button"
      [matMenuTriggerFor]="formats"
      [disabled]="busy()"
      [attr.aria-label]="'reports.exportLabel' | transloco: { name: name() }"
    >
      <mat-icon svgIcon="download" aria-hidden="true" />
      {{ 'reports.export' | transloco }}
    </button>
    <mat-menu #formats="matMenu">
      <button mat-menu-item type="button" (click)="export('PDF')">
        <mat-icon svgIcon="picture_as_pdf" aria-hidden="true" />
        {{ 'reports.formatChoice.PDF' | transloco }}
      </button>
      <button mat-menu-item type="button" (click)="export('XLSX')">
        <mat-icon svgIcon="table_chart" aria-hidden="true" />
        {{ 'reports.formatChoice.XLSX' | transloco }}
      </button>
    </mat-menu>
  `,
})
export class ExportMenu {
  readonly type = input.required<ReportType>();
  readonly params = input<ReportParams>({});

  private readonly jobs = inject(ReportJobs);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);

  protected name(): string {
    return this.transloco.translate(`reportType.${this.type()}`);
  }

  protected async export(format: ReportFormat): Promise<void> {
    this.busy.set(true);
    try {
      await this.jobs.create({ type: this.type(), format, params: this.params() });
    } catch (error: unknown) {
      this.notifier.error(this.messages.message(toApiError(error)));
      return;
    } finally {
      this.busy.set(false);
    }
    const view = await this.notifier.withAction(
      this.transloco.translate('reports.queued', { name: this.name() }),
      this.transloco.translate('reports.view'),
    );
    if (view) await this.router.navigate(['/reports']);
  }
}
