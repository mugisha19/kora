import { DestroyRef, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, filter, merge, switchMap } from 'rxjs';
import { LiveUpdates } from '../../../core/live/live-updates';
import { ProjectStore } from './project.store';

/** Changes close together (a drag moves several tasks) reload once. */
const SETTLE_MS = 300;

/**
 * Keeps a workspace tab current (feature 18, Observer): reloads when someone else changes one of
 * `entityTypes` in this project, and after a lost live connection comes back. Your own changes
 * already reload what they touch. Call from a tab's constructor.
 */
export function refreshOnActivity(entityTypes: readonly string[], reload: () => void): void {
  const live = inject(LiveUpdates);
  const project = inject(ProjectStore);
  const changes = toObservable(project.projectId).pipe(
    filter((id): id is string => !!id),
    switchMap((id) => live.projectActivity(id)),
    filter(
      (entry) =>
        entityTypes.includes(entry.entityType) && entry.actor?.userId !== project.myUserId(),
    ),
  );
  const subscription = merge(changes, live.reconnected$)
    .pipe(debounceTime(SETTLE_MS))
    .subscribe(() => reload());
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
}
