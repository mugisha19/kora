import { LiveAnnouncer } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Sprint, Task } from '../../../../core/api/api.models';
import { SprintsApi } from '../../../../core/api/sprints.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { ProjectStore } from '../project.store';
import { TaskFacade } from '../work/task.facade';
import { PriorityChip, TaskTypeIcon } from '../work/task-look';
import { BacklogStore } from './backlog.store';
import { BurndownChart, VelocityChart } from './sprint-charts';
import {
  CloseSprintDialog,
  CloseSprintDialogData,
  SprintDialog,
  SprintDialogData,
} from './sprint-dialogs';
import { refreshOnActivity } from '../live-refresh';

const DAY = 86_400_000;
const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/**
 * Backlog tab (feature 09): the active sprint (burndown, close with carry-over), planned sprints
 * (start, planned points against recent velocity), and the ranked product backlog — reordered by
 * dragging or with Move up/down, and planned into a sprint by selecting items.
 */
@Component({
  selector: 'kora-backlog-tab',
  imports: [
    BurndownChart,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatCheckbox,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatLabel,
    MatOption,
    MatSelect,
    MatTooltip,
    NgTemplateOutlet,
    PriorityChip,
    StatusChip,
    TaskTypeIcon,
    TranslocoPipe,
    VelocityChart,
  ],
  providers: [BacklogStore, TaskFacade],
  templateUrl: './backlog-tab.html',
  styleUrl: './backlog-tab.scss',
})
export class BacklogTab {
  protected readonly store = inject(BacklogStore);
  protected readonly project = inject(ProjectStore);
  protected readonly tasks = inject(TaskFacade);
  protected readonly language = inject(LanguageService);
  private readonly sprintsApi = inject(SprintsApi);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private destroyed = false;

  /** The sprint the selected backlog items go to. */
  protected readonly target = signal<string | null>(null);
  protected readonly targetSprint = computed<Sprint | undefined>(
    () =>
      this.store.sprints().find((s) => s.id === this.target()) ??
      this.store.planned()[0] ??
      this.store.active(),
  );
  protected readonly openSprints = computed(() =>
    [this.store.active(), ...this.store.planned()].filter((s): s is Sprint => Boolean(s)),
  );

  protected readonly burndown = resource({
    params: () => this.store.active()?.id,
    loader: ({ params }) => firstValueFrom(this.sprintsApi.burndown(params)),
  });

  constructor() {
    refreshOnActivity(['task', 'sprint'], () => void this.store.load());
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    void this.store.load();
  }

  protected daysLeft(sprint: Sprint): number {
    const today = new Date().toISOString().slice(0, 10);
    return Math.max(0, Math.round((Date.parse(sprint.endDate) - Date.parse(today)) / DAY) + 1);
  }

  protected donePoints(sprint: Sprint): number {
    return this.store
      .tasksOf()(sprint.id)
      .filter((t) => t.status === 'DONE')
      .reduce((total, t) => total + (t.storyPoints ?? 0), 0);
  }

  // ---------- Backlog order ----------

  protected drop(event: CdkDragDrop<Task[], Task[], Task>): void {
    if (event.previousIndex === event.currentIndex) return;
    const task = event.item.data;
    const others = this.store.backlog().filter((t) => t.id !== task.id);
    void this.reorder(task, others[event.currentIndex - 1], others[event.currentIndex]);
  }

  protected moveBy(task: Task, offset: -1 | 1): void {
    const list = this.store.backlog();
    const index = list.findIndex((t) => t.id === task.id);
    const others = list.filter((t) => t.id !== task.id);
    const target = index + offset;
    void this.reorder(task, others[target - 1], others[target]);
  }

  private async reorder(task: Task, above?: Task, below?: Task): Promise<void> {
    const moved = await this.tasks.move(task, {
      status: task.status,
      ...(above ? { afterTaskId: above.id } : {}),
      ...(below ? { beforeTaskId: below.id } : {}),
    });
    await this.store.load();
    if (moved) {
      const list = this.store.backlog();
      const position = list.findIndex((t) => t.id === task.id) + 1;
      void this.announcer.announce(
        this.transloco.translate('backlog.moved', {
          key: task.key,
          position,
          total: list.length,
        }),
      );
    }
    this.focusRow(task.id);
  }

  // ---------- Tasks ----------

  protected async open(task: Task): Promise<void> {
    if (await this.tasks.open(task)) await this.store.load();
    this.focusRow(task.id);
  }

  protected async create(): Promise<void> {
    const created = await this.tasks.open(undefined, { status: 'BACKLOG' });
    if (created && created !== 'deleted') {
      await this.store.load();
      this.focusRow(created.id);
    }
  }

  protected addSelected(): void {
    const sprint = this.targetSprint();
    if (sprint) void this.store.addSelected(sprint);
  }

  // ---------- Sprints ----------

  protected plan(): void {
    const last = [...this.store.sprints()].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    const today = new Date().toISOString().slice(0, 10);
    const start = last && last.endDate >= today ? addDays(last.endDate, 1) : today;
    this.dialog.open<SprintDialog, SprintDialogData, Sprint>(SprintDialog, {
      data: {
        suggested: {
          name: this.transloco.translate('sprints.defaultName', {
            n: this.store.sprints().length + 1,
          }),
          startDate: start,
          endDate: addDays(start, 13),
        },
        save: (request) => this.store.create(request),
      },
    });
  }

  protected edit(sprint: Sprint): void {
    this.dialog.open<SprintDialog, SprintDialogData, Sprint>(SprintDialog, {
      data: { sprint, save: (request) => this.store.update(sprint, request) },
    });
  }

  protected close(sprint: Sprint): void {
    const unfinished = this.store
      .tasksOf()(sprint.id)
      .filter((t) => t.status !== 'DONE');
    this.dialog.open<CloseSprintDialog, CloseSprintDialogData, Sprint>(CloseSprintDialog, {
      data: {
        sprint,
        unfinished: unfinished.length,
        unfinishedPoints: unfinished.reduce((t, x) => t + (x.storyPoints ?? 0), 0),
        planned: this.store.planned(),
        close: (carryOverTo) => this.store.close(sprint, carryOverTo),
      },
    });
  }

  private focusRow(taskId: string): void {
    if (this.destroyed) return;
    afterNextRender(
      () => {
        if (this.destroyed) return;
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-task="${taskId}"] .title`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }
}
