import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../../core/api/api-error';
import {
  CreateSprintRequest,
  Sprint,
  Task,
  UpdateSprintRequest,
  Velocity,
} from '../../../../core/api/api.models';
import { SprintsApi } from '../../../../core/api/sprints.api';
import { TasksApi } from '../../../../core/api/tasks.api';
import { Notifier } from '../../../../core/notify/notifier';
import { ProjectStore } from '../project.store';

interface BacklogState {
  sprints: Sprint[];
  backlog: Task[];
  /** Tasks of the active and planned sprints, by sprint id. */
  sprintTasks: Record<string, Task[]>;
  velocity: Velocity | null;
  selected: string[];
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  busy: boolean;
}

const initialState: BacklogState = {
  sprints: [],
  backlog: [],
  sprintTasks: {},
  velocity: null,
  selected: [],
  status: 'loading',
  error: null,
  busy: false,
};

const PAGE = 100;
const points = (tasks: readonly Task[]) => tasks.reduce((t, x) => t + (x.storyPoints ?? 0), 0);

/**
 * Backlog tab state (feature 09): the ranked product backlog, the active and planned sprints with
 * their tasks, and velocity for planning. Sprint commands reload what they change.
 */
export const BacklogStore = signalStore(
  withState(initialState),
  withComputed(({ sprints, sprintTasks, backlog, selected }) => ({
    active: computed(() => sprints().find((s) => s.status === 'ACTIVE')),
    planned: computed(() =>
      sprints()
        .filter((s) => s.status === 'PLANNED')
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    ),
    tasksOf: computed(() => (sprintId: string) => sprintTasks()[sprintId] ?? []),
    pointsOf: computed(() => (sprintId: string) => points(sprintTasks()[sprintId] ?? [])),
    backlogPoints: computed(() => points(backlog())),
    selectedTasks: computed(() => backlog().filter((t) => selected().includes(t.id))),
  })),
  withMethods(
    (
      store,
      sprintsApi = inject(SprintsApi),
      tasksApi = inject(TasksApi),
      project = inject(ProjectStore),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
    ) => {
      const projectId = () => project.projectId() ?? '';

      const allBacklog = async (): Promise<Task[]> => {
        const tasks: Task[] = [];
        for (let page = 0; ; page++) {
          const result = await firstValueFrom(
            sprintsApi.backlog(projectId(), { page, size: PAGE }),
          );
          tasks.push(...result.content);
          if (page + 1 >= result.totalPages) return tasks;
        }
      };

      const load = async (): Promise<void> => {
        try {
          const [sprints, backlog, velocity] = await Promise.all([
            firstValueFrom(sprintsApi.list(projectId())),
            allBacklog(),
            firstValueFrom(sprintsApi.velocity(projectId())),
          ]);
          const open = sprints.filter((s) => s.status !== 'CLOSED');
          const lists = await Promise.all(
            open.map((s) =>
              firstValueFrom(tasksApi.list(projectId(), { sprintId: s.id, size: PAGE })),
            ),
          );
          patchState(store, {
            sprints,
            backlog,
            velocity,
            sprintTasks: Object.fromEntries(open.map((s, i) => [s.id, lists[i].content])),
            selected: store.selected().filter((id) => backlog.some((t) => t.id === id)),
            status: 'ready',
            error: null,
          });
        } catch (error: unknown) {
          patchState(store, { status: 'error', error: toApiError(error) });
        }
      };

      /** Runs a command that the interceptor toasts on failure, then reloads. */
      const run = async (command: () => Promise<unknown>, successKey: string, params = {}) => {
        patchState(store, { busy: true });
        try {
          await command();
          notifier.success(transloco.translate(successKey, params));
          return true;
        } catch {
          return false;
        } finally {
          patchState(store, { busy: false });
          await load();
        }
      };

      return {
        load,
        toggle(taskId: string, on: boolean): void {
          const selected = store.selected().filter((id) => id !== taskId);
          patchState(store, { selected: on ? [...selected, taskId] : selected });
        },
        clearSelection: () => patchState(store, { selected: [] }),

        /** Rejects with the ApiError (the sprint dialog shows it). */
        async create(request: CreateSprintRequest): Promise<Sprint> {
          const sprint = await firstValueFrom(sprintsApi.create(projectId(), request));
          notifier.success(transloco.translate('sprints.created', { name: sprint.name }));
          await load();
          return sprint;
        },
        /** Rejects with the ApiError (the sprint dialog shows it). */
        async update(sprint: Sprint, request: UpdateSprintRequest): Promise<Sprint> {
          const saved = await firstValueFrom(sprintsApi.update(sprint.id, request, sprint.version));
          notifier.success(transloco.translate('sprints.saved', { name: saved.name }));
          await load();
          return saved;
        },
        start: (sprint: Sprint) =>
          run(() => firstValueFrom(sprintsApi.start(sprint.id)), 'sprints.started', {
            name: sprint.name,
          }),
        /** Rejects with the ApiError (the close dialog shows it). */
        async close(sprint: Sprint, carryOverTo: string): Promise<Sprint> {
          const closed = await firstValueFrom(sprintsApi.close(sprint.id, carryOverTo));
          notifier.success(
            transloco.translate('sprints.closed', {
              name: closed.name,
              points: closed.completedPoints ?? 0,
            }),
          );
          await load();
          return closed;
        },
        addSelected: (sprint: Sprint) =>
          run(
            () => firstValueFrom(sprintsApi.addTasks(sprint.id, store.selected())),
            'sprints.tasksAdded',
            { count: store.selected().length, name: sprint.name },
          ).then((ok) => {
            if (ok) patchState(store, { selected: [] });
            return ok;
          }),
        removeFromSprint: (sprint: Sprint, task: Task) =>
          run(
            () => firstValueFrom(sprintsApi.removeTask(sprint.id, task.id)),
            'sprints.taskRemoved',
            { key: task.key },
          ),
      };
    },
  ),
);

export type BacklogStore = InstanceType<typeof BacklogStore>;
