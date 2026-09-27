import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../../core/api/api-error';
import {
  CreateDependencyRequest,
  Dependency,
  Schedule,
  Task,
  UpdateTaskRequest,
  WorkingCalendar,
} from '../../../../core/api/api.models';
import { ScheduleApi } from '../../../../core/api/schedule.api';
import { TasksApi } from '../../../../core/api/tasks.api';
import { Notifier } from '../../../../core/notify/notifier';
import { ProjectStore } from '../project.store';

interface ScheduleState {
  schedule: Schedule | null;
  dependencies: Dependency[];
  calendar: WorkingCalendar | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  /** The loop that stops the schedule from being computed (task keys, first = last). */
  loop: string[] | null;
}

const initialState: ScheduleState = {
  schedule: null,
  dependencies: [],
  calendar: null,
  status: 'loading',
  error: null,
  loop: null,
};

/** A predecessor link as a row shows it: "AKG-005-2 SS+3". */
export interface LinkView {
  dependency: Dependency;
  /** The task at the other end. */
  key: string;
  title: string;
}

/** The chain of task keys a `schedule.cycle` error names, or null for any other error. */
export function loopOf(error: ApiError): string[] | null {
  if (error.code !== 'schedule.cycle') return null;
  const cycle = error.fieldErrors[0]?.params?.['cycle'];
  return Array.isArray(cycle) ? cycle.map(String) : [];
}

/**
 * The schedule tab (feature 10): the CPM schedule the API computes, the project's dependencies and
 * the organization's working calendar (for the Gantt's non-working days). Every edit goes to the
 * API and reloads the schedule, since one change can move every later task.
 */
export const ScheduleStore = signalStore(
  withState(initialState),
  withComputed(({ schedule, dependencies }) => {
    const rows = computed(() => schedule()?.tasks ?? []);
    const byId = computed(() => new Map(rows().map((r) => [r.taskId, r])));
    const linksOf = (
      side: 'predecessorId' | 'successorId',
      other: 'predecessorId' | 'successorId',
    ) =>
      computed(() => {
        const map = new Map<string, LinkView[]>();
        for (const dependency of dependencies()) {
          const task = byId().get(dependency[other]);
          const list = map.get(dependency[side]) ?? [];
          list.push({ dependency, key: task?.key ?? '?', title: task?.title ?? '' });
          map.set(dependency[side], list);
        }
        return map;
      });
    return {
      rows,
      byId,
      /** Per successor: the links into it. */
      predecessors: linksOf('successorId', 'predecessorId'),
      /** Per predecessor: the links out of it. */
      successors: linksOf('predecessorId', 'successorId'),
      criticalCount: computed(() => rows().filter((r) => r.critical).length),
    };
  }),
  withMethods(
    (
      store,
      api = inject(ScheduleApi),
      tasksApi = inject(TasksApi),
      project = inject(ProjectStore),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
    ) => {
      const projectId = () => project.projectId() ?? '';
      const t = (key: string, params?: Record<string, unknown>) => transloco.translate(key, params);

      const loadSchedule = async (): Promise<void> => {
        try {
          const schedule = await firstValueFrom(api.schedule(projectId()));
          patchState(store, { schedule, status: 'ready', error: null, loop: null });
        } catch (error: unknown) {
          const apiError = toApiError(error);
          const loop = loopOf(apiError);
          // A loop saved before the rule existed: show the chain and the links to break it.
          patchState(
            store,
            loop
              ? { status: 'ready', loop, schedule: null }
              : {
                  status: 'error',
                  error: apiError,
                },
          );
        }
      };
      const loadDependencies = async (): Promise<void> => {
        try {
          patchState(store, { dependencies: await firstValueFrom(api.dependencies(projectId())) });
        } catch {
          // The schedule still shows; its arrows are missing until the next load.
        }
      };

      return {
        async load(): Promise<void> {
          const calendar = store.calendar()
            ? Promise.resolve()
            : firstValueFrom(api.calendar()).then(
                (calendar) => patchState(store, { calendar }),
                // Without it the chart shades Saturdays and Sundays only.
                () => undefined,
              );
          await Promise.all([calendar, loadDependencies(), loadSchedule()]);
        },
        async reload(): Promise<void> {
          await Promise.all([loadDependencies(), loadSchedule()]);
        },

        /** The task behind a row, for its version and constraint. */
        task(taskId: string): Promise<Task> {
          return firstValueFrom(tasksApi.get(taskId));
        },

        /** Rejects with the ApiError (the form shows it). */
        async updateTask(task: Task, changes: UpdateTaskRequest): Promise<Task> {
          const saved = await firstValueFrom(tasksApi.update(task.id, changes, task.version));
          await loadSchedule();
          return saved;
        },

        /** Rejects with the ApiError: the form names a loop's chain. */
        async addDependency(request: CreateDependencyRequest): Promise<Dependency> {
          const dependency = await firstValueFrom(api.addDependency(projectId(), request));
          patchState(store, { dependencies: [...store.dependencies(), dependency] });
          await loadSchedule();
          return dependency;
        },

        async removeDependency(link: LinkView, successor: string): Promise<boolean> {
          try {
            await firstValueFrom(api.removeDependency(link.dependency.id));
          } catch {
            return false;
          }
          patchState(store, {
            dependencies: store.dependencies().filter((d) => d.id !== link.dependency.id),
          });
          notifier.success(t('schedule.linkRemoved', { from: link.key, to: successor }));
          await loadSchedule();
          return true;
        },

        async saveBaseline(): Promise<boolean> {
          try {
            const baseline = await firstValueFrom(api.saveBaseline(projectId()));
            notifier.success(t('schedule.baselineSaved', { number: baseline.number }));
            await loadSchedule();
            return true;
          } catch {
            return false;
          }
        },
      };
    },
  ),
);

export type ScheduleStore = InstanceType<typeof ScheduleStore>;

/** "FS", "SS+3", "FS−2": a link's type and lag as the table and the chart label it. */
export function linkLabel(dependency: Pick<Dependency, 'type' | 'lagDays'>): string {
  const lag = dependency.lagDays;
  if (!lag) return dependency.type;
  return `${dependency.type}${lag > 0 ? '+' : '−'}${Math.abs(lag)}`;
}
