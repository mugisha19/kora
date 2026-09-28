import { Component, DestroyRef, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { TasksApi } from '../../../../core/api/tasks.api';
import { Notifier } from '../../../../core/notify/notifier';
import { tabsFor } from '../../methodology';
import { ProjectStore } from '../project.store';
import { TaskFacade } from './task.facade';

/**
 * `/board/<taskId>` and `/schedule/<taskId>`: the task opens in its sheet over the tab; closing it
 * goes back to the tab (filters kept). A save or delete refreshes the tab behind.
 */
@Component({ selector: 'kora-task-sheet-route', template: '' })
export class TaskSheetRoute {
  /** Route parameter. */
  readonly taskId = input.required<string>();

  private readonly api = inject(TasksApi);
  private readonly facade = inject(TaskFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    let leaving = false;
    inject(DestroyRef).onDestroy(() => (leaving = true));
    effect(() => {
      const taskId = this.taskId();
      untracked(() => void this.show(taskId, () => leaving));
    });
  }

  private async show(taskId: string, left: () => boolean): Promise<void> {
    const back = () =>
      void this.router.navigate(['..'], {
        relativeTo: this.route,
        queryParamsHandling: 'preserve',
      });
    let task;
    try {
      task = await firstValueFrom(this.api.get(taskId));
    } catch {
      this.notifier.error(this.transloco.translate('tasks.notFound'));
      back();
      return;
    }
    const result = await this.facade.open(task);
    if (result) this.facade.notifyChanged();
    if (!left() && this.taskId() === taskId) back();
  }
}

/**
 * `/projects/<id>/tasks/<taskId>` (notification and activity links): opens the task over the
 * board, or over the schedule for a predictive project.
 */
@Component({ selector: 'kora-task-link-route', template: '' })
export class TaskLinkRoute {
  /** Route parameter. */
  readonly taskId = input.required<string>();

  constructor() {
    const project = inject(ProjectStore);
    const router = inject(Router);
    effect(() => {
      const methodology = project.project()?.methodology;
      const projectId = project.projectId();
      if (!methodology || !projectId) return;
      const tab = tabsFor(methodology).includes('board') ? 'board' : 'schedule';
      untracked(
        () =>
          void router.navigate(['/projects', projectId, tab, this.taskId()], { replaceUrl: true }),
      );
    });
  }
}
