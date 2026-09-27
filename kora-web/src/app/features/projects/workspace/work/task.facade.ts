import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import {
  CreateTaskRequest,
  MoveTaskRequest,
  Task,
  UpdateTaskRequest,
} from '../../../../core/api/api.models';
import { TasksApi } from '../../../../core/api/tasks.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { Notifier } from '../../../../core/notify/notifier';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { ProjectStore } from '../project.store';
import { ReasonDialog, ReasonDialogData } from './reason-dialog';
import { TaskDialog, TaskDialogData } from './task-dialog';
import { canChangeTask } from './task-look';

export type TaskDialogResult = Task | 'deleted' | undefined;

/**
 * Task commands shared by the board and the backlog, provided by each tab: opens the task side
 * sheet with the caller's rights, and moves tasks — asking for a reason before blocking one and
 * offering "move anyway" when a column is at its WIP limit. Moves aren't toasted by the
 * interceptor (the board handles their answers), so failures are announced here.
 */
@Injectable()
export class TaskFacade {
  private readonly api = inject(TasksApi);
  private readonly project = inject(ProjectStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);

  canChange(task: Task): boolean {
    return canChangeTask(task, this.project.myUserId(), {
      manages: this.project.canEdit(),
      contributes: this.project.canContribute(),
    });
  }

  /** Opens a task, or a blank one to create (`defaults` says where it starts). */
  open(task?: Task, defaults?: TaskDialogData['defaults']): Promise<TaskDialogResult> {
    const projectId = this.project.projectId() ?? '';
    const data: TaskDialogData = {
      ...(task ? { task } : {}),
      ...(defaults ? { defaults } : {}),
      assignable: this.project.assignable(),
      canChange: task ? this.canChange(task) : this.project.canContribute(),
      canComment: this.project.canContribute(),
      canDelete: this.project.canEdit(),
      scheduling: this.project.project()?.methodology !== 'AGILE',
      save: async (request, existing) => {
        const saved = existing
          ? await firstValueFrom(
              this.api.update(existing.id, request as UpdateTaskRequest, existing.version),
            )
          : await firstValueFrom(this.api.create(projectId, request as CreateTaskRequest));
        this.notifier.success(
          this.transloco.translate(existing ? 'tasks.saved' : 'tasks.created', { key: saved.key }),
        );
        return saved;
      },
      remove: (toRemove) => this.remove(toRemove),
    };
    return firstValueFrom(
      this.dialog
        .open<TaskDialog, TaskDialogData, TaskDialogResult>(TaskDialog, {
          data,
          position: { right: '0' },
          height: '100dvh',
          width: 'min(560px, 100vw)',
          maxWidth: '100vw',
          panelClass: 'kora-side-sheet',
          autoFocus: 'dialog',
        })
        .afterClosed(),
    );
  }

  async remove(task: Task): Promise<boolean> {
    const t = (key: string) => this.transloco.translate(key, { key: task.key, title: task.title });
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: t('tasks.deleteTitle'),
        message: t('tasks.deleteMessage'),
        confirmLabel: t('common.delete'),
        destructive: true,
      }),
    );
    if (!confirmed) return false;
    try {
      await firstValueFrom(this.api.delete(task.id));
      this.notifier.success(t('tasks.deleted'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Moves a task; resolves with the moved task, or `null` when it didn't move (cancelled or
   * refused — the caller puts the card back).
   */
  async move(task: Task, request: MoveTaskRequest): Promise<Task | null> {
    let body = request;
    if (request.status === 'BLOCKED' && task.status !== 'BLOCKED' && !request.reason) {
      const reason = await this.askReason(task);
      if (!reason) return null;
      body = { ...request, reason };
    }
    try {
      return await firstValueFrom(this.api.move(task.id, body));
    } catch (error: unknown) {
      const apiError = toApiError(error);
      if (apiError.code === 'tasks.wip_limit_reached' && !body.override) {
        return (await this.confirmOverride(task))
          ? this.move(task, { ...body, override: true })
          : null;
      }
      this.notifier.error(this.messages.message(apiError), apiError.correlationId);
      return null;
    }
  }

  private async askReason(task: Task): Promise<string | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, {
          data: {
            title: this.transloco.translate('tasks.blockTitle', { key: task.key }),
            label: this.transloco.translate('tasks.blockReason'),
            confirm: this.transloco.translate('tasks.block'),
          },
        })
        .afterClosed(),
    );
  }

  /** The API's detail is English; the dialog says it in the UI's language instead. */
  private confirmOverride(task: Task): Promise<boolean> {
    return firstValueFrom(
      this.confirmDialog.confirm({
        title: this.transloco.translate('board.wipTitle'),
        message: this.transloco.translate('board.wipMessage', { key: task.key }),
        confirmLabel: this.transloco.translate('board.moveAnyway'),
      }),
    );
  }
}
