import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import { ScheduledTask, Task, UpdateTaskRequest } from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { LanguageService } from '../../../../core/i18n/language.service';
import { Notifier } from '../../../../core/notify/notifier';
import {
  LocalizedDatePipe,
  formatLocalizedDate,
} from '../../../../shared/forms/localized-date.pipe';
import { QueryParams } from '../../../../shared/routing/query-params';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import { TaskFacade } from '../work/task.facade';
import { BarLink, BarMove, BarResize, GanttChart } from './gantt-chart';
import { WEEKEND_RULE, ZOOMS, Zoom, localToday } from './gantt-geometry';
import {
  DependencyDialog,
  DependencyDialogData,
  TaskScheduleDialog,
  TaskScheduleDialogData,
} from './schedule-dialogs';
import { LinkRemoval, ScheduleTable } from './schedule-table';
import { ScheduleStore, loopOf } from './schedule.store';

/**
 * Schedule tab (feature 10) for Predictive and Hybrid projects: the critical-path schedule as a
 * Gantt chart or a table (view and zoom in the URL). Managers move and resize bars, link tasks,
 * edit durations and constraints, and save baselines; everyone else reads.
 */
@Component({
  selector: 'kora-schedule-tab',
  imports: [
    EmptyState,
    ErrorState,
    GanttChart,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatIcon,
    ScheduleTable,
    TranslocoPipe,
  ],
  providers: [ScheduleStore, TaskFacade, QueryParams],
  templateUrl: './schedule-tab.html',
  styleUrl: './schedule-tab.scss',
})
export class ScheduleTab {
  /** Query parameters (bound by the router). */
  readonly view = input<string>();
  readonly zoom = input<string>();

  protected readonly store = inject(ScheduleStore);
  protected readonly project = inject(ProjectStore);
  protected readonly query = inject(QueryParams);
  protected readonly language = inject(LanguageService);
  private readonly tasks = inject(TaskFacade);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);

  protected readonly zooms = ZOOMS;
  protected readonly today = localToday();
  protected readonly shownView = computed(() => (this.view() === 'table' ? 'table' : 'chart'));
  protected readonly shownZoom = computed<Zoom>(() =>
    ZOOMS.includes(this.zoom() as Zoom) ? (this.zoom() as Zoom) : 'week',
  );
  protected readonly editable = computed(
    () => this.project.canEdit() && this.project.project()?.methodology !== 'AGILE',
  );
  protected readonly rule = computed(() => this.store.calendar() ?? WEEKEND_RULE);
  /** A link drawn on the chart that would close a loop. */
  protected readonly chartLoop = signal<string[] | null>(null);

  protected readonly chartLabel = computed(() => {
    const schedule = this.store.schedule();
    const locale = this.language.current();
    return this.transloco.translate('schedule.chartLabel', {
      count: this.store.rows().length,
      start: formatLocalizedDate(schedule?.projectStart, locale),
      finish: formatLocalizedDate(schedule?.projectFinish, locale),
      critical: this.store.criticalCount(),
    });
  });

  constructor() {
    void this.store.load();
  }

  // ---------- Table and chart commands ----------

  protected async open(row: ScheduledTask): Promise<void> {
    const task = await this.fetch(row);
    if (task && (await this.tasks.open(task))) await this.store.reload();
  }

  protected async edit(row: ScheduledTask): Promise<void> {
    const task = await this.fetch(row);
    if (!task) return;
    this.dialog.open<TaskScheduleDialog, TaskScheduleDialogData, boolean>(TaskScheduleDialog, {
      data: { task, save: (changes) => this.store.updateTask(task, changes) },
    });
  }

  protected addLink(successor?: ScheduledTask): void {
    this.dialog.open<DependencyDialog, DependencyDialogData, boolean>(DependencyDialog, {
      data: {
        tasks: this.store.rows(),
        ...(successor ? { successorId: successor.taskId } : {}),
        save: (request) => this.store.addDependency(request),
      },
    });
  }

  protected async removeLink({ link, task }: LinkRemoval): Promise<void> {
    await this.store.removeDependency(link, task.key);
  }

  protected async saveBaseline(): Promise<void> {
    const current = this.store.schedule()?.baseline;
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: t('schedule.baselineTitle', { number: (current?.number ?? 0) + 1 }),
        message: t(current ? 'schedule.baselineReplace' : 'schedule.baselineFirst'),
        confirmLabel: t('schedule.saveBaseline'),
      }),
    );
    if (confirmed) await this.store.saveBaseline();
  }

  protected async moved({ task: row, start }: BarMove): Promise<void> {
    const locale = this.language.current();
    await this.change(
      row,
      { scheduleConstraint: 'START_NO_EARLIER_THAN', constraintDate: start },
      'schedule.movedTo',
      { key: row.key, date: formatLocalizedDate(start, locale) },
    );
  }

  protected async resized({ task: row, durationDays }: BarResize): Promise<void> {
    await this.change(row, { durationDays }, 'schedule.resizedTo', {
      key: row.key,
      count: durationDays,
    });
  }

  protected async linked({ predecessor, successor }: BarLink): Promise<void> {
    this.chartLoop.set(null);
    try {
      await this.store.addDependency({
        predecessorId: predecessor.taskId,
        successorId: successor.taskId,
        type: 'FS',
        lagDays: 0,
      });
      this.announce('schedule.linked', { from: predecessor.key, to: successor.key });
    } catch (error: unknown) {
      const apiError = toApiError(error);
      const loop = loopOf(apiError);
      if (loop) {
        this.chartLoop.set(loop);
      } else {
        this.notifier.error(this.messages.message(apiError), apiError.correlationId);
      }
    }
  }

  private async change(
    row: ScheduledTask,
    changes: UpdateTaskRequest,
    message: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    this.chartLoop.set(null);
    const task = await this.fetch(row);
    if (!task) return;
    try {
      await this.store.updateTask(task, changes);
      this.announce(message, params);
    } catch {
      // Toasted by the error interceptor; the bar stays where the schedule puts it.
    }
  }

  private async fetch(row: ScheduledTask): Promise<Task | null> {
    try {
      return await this.store.task(row.taskId);
    } catch {
      return null;
    }
  }

  private announce(key: string, params: Record<string, unknown>): void {
    void this.announcer.announce(this.transloco.translate(key, params));
  }
}
