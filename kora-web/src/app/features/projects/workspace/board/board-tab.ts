import { LiveAnnouncer } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  BoardColumnSettings,
  BoardStatus,
  TASK_TYPES,
  Task,
} from '../../../../core/api/api.models';
import { TasksApi } from '../../../../core/api/tasks.api';
import { QueryParams } from '../../../../shared/routing/query-params';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { ProjectStore } from '../project.store';
import { TaskFacade } from '../work/task.facade';
import { DEFAULT_COLUMN_NAMES, canMoveTask } from '../work/task-look';
import { BoardCard, CardMove } from './board-card';
import { BoardStore, ColumnMeta } from './board.store';
import { ColumnDialog, ColumnDialogData } from './column-dialog';

/**
 * Board tab (feature 08): the Kanban board of the active sprint (or every task), with WIP limits,
 * filters and optional swimlanes, all kept in the URL. Cards move by drag and drop or with their
 * "Move" menu; each move is announced ("Moved AKG-001-49 to In review, position 2 of 5").
 */
@Component({
  selector: 'kora-board-tab',
  imports: [
    BoardCard,
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    CdkDropListGroup,
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatLabel,
    MatOption,
    MatSelect,
    MatSelectTrigger,
    MatSlideToggle,
    MatTooltip,
    NgTemplateOutlet,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [BoardStore, TaskFacade, QueryParams],
  templateUrl: './board-tab.html',
  styleUrl: './board-tab.scss',
})
export class BoardTab {
  /** Query parameters (bound by the router). */
  readonly sprint = input<string>();
  readonly assignee = input<string>();
  readonly label = input<string>();
  readonly type = input<string>();
  readonly lanes = input<string>();

  protected readonly store = inject(BoardStore);
  protected readonly project = inject(ProjectStore);
  protected readonly tasks = inject(TaskFacade);
  protected readonly query = inject(QueryParams);
  private readonly api = inject(TasksApi);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private destroyed = false;

  protected readonly types = TASK_TYPES;
  protected readonly swimlanes = computed(() => this.lanes() === 'assignee');
  protected readonly columnNames = computed(() =>
    this.store.columns().map((c) => ({ status: c.status, name: this.columnName(c) })),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    effect(() => {
      const filters = {
        sprint: this.sprint() ?? null,
        assigneeId: this.assignee() ?? null,
        label: this.label() ?? null,
        type: this.type() ?? null,
      };
      untracked(() => void this.store.load(filters));
    });
  }

  protected columnName(column: Pick<ColumnMeta, 'status' | 'name'>): string {
    return column.name === DEFAULT_COLUMN_NAMES[column.status]
      ? this.transloco.translate(`taskStatus.${column.status}`)
      : column.name;
  }

  protected tasksIn(status: BoardStatus, laneId?: string): Task[] {
    const tasks = this.store.column(status)?.tasks ?? [];
    if (laneId === undefined) return tasks;
    return tasks.filter((t) => (laneId === 'none' ? !t.assignee : t.assignee?.userId === laneId));
  }

  // ---------- Moves ----------

  /** Only moves the lifecycle allows are drop targets. */
  protected readonly canEnter = (drag: CdkDrag<Task>, drop: CdkDropList<BoardStatus>) =>
    canMoveTask(drag.data.status, drop.data);

  protected drop(event: CdkDragDrop<BoardStatus, BoardStatus, Task>, laneId?: string): void {
    const task = event.item.data;
    const status = event.container.data;
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) {
      return;
    }
    const list = this.tasksIn(status, laneId).filter((t) => t.id !== task.id);
    void this.move(task, status, list[event.currentIndex - 1], list[event.currentIndex]);
  }

  protected keyboardMove({ task, status, offset }: CardMove, laneId?: string): void {
    const list = this.tasksIn(status, laneId);
    if (offset) {
      const index = list.findIndex((t) => t.id === task.id);
      const others = list.filter((t) => t.id !== task.id);
      const target = index + offset;
      void this.move(task, status, others[target - 1], others[target]);
    } else {
      void this.move(task, status, list.at(-1), undefined);
    }
  }

  private async move(task: Task, status: BoardStatus, above?: Task, below?: Task): Promise<void> {
    if (!canMoveTask(task.status, status)) return;
    this.store.place(task, status, above, below);
    const moved = await this.tasks.move(task, {
      status,
      ...(above ? { afterTaskId: above.id } : {}),
      ...(below ? { beforeTaskId: below.id } : {}),
    });
    this.store.settle(task.id);
    await this.store.reload();
    if (moved) {
      const column = this.store.column(status);
      const position = (column?.tasks.findIndex((t) => t.id === task.id) ?? 0) + 1;
      void this.announcer.announce(
        this.transloco.translate('board.moved', {
          key: task.key,
          column: column ? this.columnName(column) : status,
          position,
          total: column?.tasks.length ?? 0,
        }),
      );
    } else {
      void this.announcer.announce(this.transloco.translate('board.notMoved', { key: task.key }));
    }
    this.focusCard(task.id);
  }

  // ---------- Tasks and columns ----------

  protected async open(task: Task): Promise<void> {
    const result = await this.tasks.open(task);
    if (result) await this.store.reload();
    this.focusCard(task.id);
  }

  protected async create(): Promise<void> {
    const sprintId = this.store.shownSprintId();
    const created = await this.tasks.open(undefined, {
      status: 'TODO',
      ...(sprintId && this.store.shownSprint()?.status !== 'CLOSED' ? { sprintId } : {}),
    });
    if (created && created !== 'deleted') {
      await this.store.reload();
      this.focusCard(created.id);
    }
  }

  protected configure(column: ColumnMeta): void {
    const projectId = this.project.projectId() ?? '';
    this.dialog
      .open<ColumnDialog, ColumnDialogData, BoardColumnSettings>(ColumnDialog, {
        data: {
          status: column.status,
          name: this.columnName(column),
          ...(column.wipLimit !== undefined ? { wipLimit: column.wipLimit } : {}),
          save: (settings) =>
            firstValueFrom(this.api.configureColumn(projectId, column.status, settings)),
        },
      })
      .afterClosed()
      .subscribe((settings) => {
        if (settings) this.store.setColumn(settings);
      });
  }

  /**
   * Puts focus back on a card after it moved: re-ordering its DOM node drops focus. The Move
   * button, so the next move is one key away; the title when the card can't be moved.
   */
  private focusCard(taskId: string): void {
    if (this.destroyed) return;
    afterNextRender(
      () => {
        if (this.destroyed) return;
        const card = this.host.nativeElement.querySelector(`[data-task="${taskId}"]`);
        card?.querySelector<HTMLElement>('.move, .title')?.focus();
      },
      { injector: this.injector },
    );
  }
}
