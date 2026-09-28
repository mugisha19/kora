import { Injectable, Injector, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import { AllocationInput, TimesheetSummary } from '../../../../core/api/api.models';
import { ResourcesApi } from '../../../../core/api/resources.api';
import { TimesheetsApi } from '../../../../core/api/timesheets.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { Notifier } from '../../../../core/notify/notifier';
import { isoWeekOf } from '../../../../shared/format/iso-week';
import { ProjectStore } from '../project.store';
import { ReasonDialog, ReasonDialogData } from '../work/reason-dialog';
import { TimesheetDialog } from './timesheet-dialog';

/**
 * The project's time commands (features 15–16), provided by the time tab: approving or sending
 * back submitted timesheets (never your own), and saving planned hours. `version` moves after
 * every change.
 */
@Injectable()
export class TimeFacade {
  private readonly timesheets = inject(TimesheetsApi);
  private readonly resources = inject(ResourcesApi);
  private readonly project = inject(ProjectStore);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);

  readonly version = signal(0);

  /** Managers decide, but never on their own time (it goes to the PMO). */
  canDecide(sheet: TimesheetSummary): boolean {
    return (
      this.project.canEdit() &&
      sheet.status === 'SUBMITTED' &&
      sheet.user.userId !== this.project.myUserId()
    );
  }

  view(sheet: TimesheetSummary): void {
    this.dialog.open(TimesheetDialog, { data: sheet, injector: this.injector });
  }

  approve(sheet: TimesheetSummary): Promise<boolean> {
    return this.run(this.timesheets.approve(sheet.id), 'time.approved', sheet);
  }

  async reject(sheet: TimesheetSummary): Promise<boolean> {
    const t = (key: string) => this.transloco.translate(key, this.params(sheet));
    const comment = await firstValueFrom(
      this.dialog
        .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, {
          data: {
            title: t('time.rejectTitle'),
            label: t('time.rejectComment'),
            confirm: t('time.reject'),
            maxLength: 1000,
          },
        })
        .afterClosed(),
    );
    return comment
      ? this.run(this.timesheets.reject(sheet.id, comment), 'time.rejected', sheet)
      : false;
  }

  /** Saves changed planned hours (0 removes); rejects with the API's error for the editor. */
  async saveAllocations(changes: AllocationInput[]): Promise<void> {
    await firstValueFrom(this.resources.saveAllocations(this.project.projectId() ?? '', changes));
    this.version.update((v) => v + 1);
    this.notifier.success(this.transloco.translate('time.allocationsSaved'));
  }

  private async run(call: Observable<unknown>, message: string, sheet: TimesheetSummary) {
    try {
      await firstValueFrom(call);
    } catch (error: unknown) {
      const apiError = toApiError(error);
      this.notifier.error(this.messages.message(apiError), apiError.correlationId);
      return false;
    }
    this.version.update((v) => v + 1);
    this.notifier.success(this.transloco.translate(message, this.params(sheet)));
    return true;
  }

  private params(sheet: TimesheetSummary) {
    return { name: sheet.user.fullName, week: isoWeekOf(sheet.weekStart).slice(6) };
  }
}
