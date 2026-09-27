import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  removeEntity,
  setAllEntities,
  setEntity,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../../core/api/api-error';
import {
  BOARD_STATUSES,
  BoardColumn,
  BoardStatus,
  Sprint,
  Task,
} from '../../../../core/api/api.models';
import { SprintsApi } from '../../../../core/api/sprints.api';
import { TasksApi } from '../../../../core/api/tasks.api';
import { ProjectStore } from '../project.store';

export type ColumnMeta = Omit<BoardColumn, 'tasks'> & { status: BoardStatus };

export interface BoardFilters {
  /** A sprint's id, or `all` for every task on the board. */
  sprint: string | null;
  assigneeId: string | null;
  label: string | null;
  type: string | null;
}

interface BoardState {
  sprints: Sprint[];
  columns: ColumnMeta[];
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  filters: BoardFilters;
  /** A move is on its way to the server (its card is already where it was dropped). */
  pending: string[];
}

const initialState: BoardState = {
  sprints: [],
  columns: [],
  status: 'loading',
  error: null,
  filters: { sprint: null, assigneeId: null, label: null, type: null },
  pending: [],
};

const byRank = (a: Task, b: Task) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/**
 * The Kanban board (feature 08). Tasks are entities (`withEntities`); columns keep their settings
 * and the API's project-wide WIP counts. The sprint shown defaults to the active one. Moves are
 * optimistic: the card goes where it was dropped at once and snaps back if the API refuses.
 */
export const BoardStore = signalStore(
  withState(initialState),
  withEntities<Task>(),
  withComputed(({ entities, columns, filters, sprints }) => {
    const activeSprint = computed(() => sprints().find((s) => s.status === 'ACTIVE'));
    const shownSprintId = computed(() => {
      const chosen = filters().sprint;
      if (chosen === 'all') return undefined;
      return chosen ?? activeSprint()?.id;
    });
    const visible = computed(() => {
      const { assigneeId, label, type } = filters();
      return entities()
        .filter(
          (t) =>
            !assigneeId ||
            (assigneeId === 'none' ? !t.assignee : t.assignee?.userId === assigneeId),
        )
        .filter((t) => !label || t.labels.includes(label))
        .filter((t) => !type || t.type === type)
        .sort(byRank);
    });
    return {
      activeSprint,
      shownSprintId,
      shownSprint: computed(() => sprints().find((s) => s.id === shownSprintId())),
      board: computed(() =>
        columns().map((column) => ({
          ...column,
          tasks: visible().filter((t) => t.status === column.status),
        })),
      ),
      /** Swimlanes: one per assignee on the board, unassigned last. */
      lanes: computed(() => {
        const people = new Map<string, string>();
        visible().forEach((t) => t.assignee && people.set(t.assignee.userId, t.assignee.fullName));
        const lanes = [...people.entries()]
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([id, name]) => ({ id, name: name as string | null }));
        return visible().some((t) => !t.assignee) ? [...lanes, { id: 'none', name: null }] : lanes;
      }),
      labels: computed(() => [...new Set(entities().flatMap((t) => t.labels))].sort()),
      hasFilters: computed(() =>
        Boolean(filters().assigneeId || filters().label || filters().type),
      ),
    };
  }),
  withMethods(
    (
      store,
      tasksApi = inject(TasksApi),
      sprintsApi = inject(SprintsApi),
      project = inject(ProjectStore),
    ) => {
      const projectId = () => project.projectId() ?? '';

      const loadBoard = async (): Promise<void> => {
        try {
          const board = await firstValueFrom(tasksApi.board(projectId(), store.shownSprintId()));
          patchState(store, setAllEntities(board.columns.flatMap((c) => c.tasks)), {
            columns: board.columns.map((column) => ({
              status: column.status as BoardStatus,
              name: column.name,
              ...(column.wipLimit !== undefined ? { wipLimit: column.wipLimit } : {}),
              taskCount: column.taskCount,
              atLimit: column.atLimit,
            })),
            status: 'ready',
            error: null,
          });
        } catch (error: unknown) {
          patchState(store, { status: 'error', error: toApiError(error) });
        }
      };

      return {
        async load(filters: BoardFilters): Promise<void> {
          patchState(store, { filters });
          if (!store.sprints().length) {
            try {
              patchState(store, { sprints: await firstValueFrom(sprintsApi.list(projectId())) });
            } catch {
              // No sprints to choose from; the board still shows every task.
            }
          }
          await loadBoard();
        },
        reload: loadBoard,

        /** The column a card is in, the tasks around a position, for a move request. */
        column(status: BoardStatus) {
          return store.board().find((c) => c.status === status);
        },
        statuses: () => BOARD_STATUSES,

        /** Puts the card where it was dropped until the API answers. */
        place(task: Task, status: BoardStatus, above?: Task, below?: Task): void {
          // Opaque ranks can't be computed here; this key sorts between the neighbours and is
          // replaced by the API's rank when it answers.
          const rank = above ? `${above.rank}\u0001` : below ? '' : `${task.rank}\u0001`;
          patchState(store, updateEntity({ id: task.id, changes: { status, rank } }), {
            pending: [...store.pending(), task.id],
          });
        },
        settle(taskId: string): void {
          patchState(store, { pending: store.pending().filter((p) => p !== taskId) });
        },
        replace(task: Task): void {
          patchState(store, setEntity(task));
        },
        remove(taskId: string): void {
          patchState(store, removeEntity(taskId));
        },
        setColumn(settings: Pick<ColumnMeta, 'status' | 'name' | 'wipLimit'>): void {
          patchState(store, {
            columns: store.columns().map((c) =>
              c.status === settings.status
                ? {
                    ...c,
                    name: settings.name,
                    wipLimit: settings.wipLimit,
                    atLimit: settings.wipLimit !== undefined && c.taskCount >= settings.wipLimit,
                  }
                : c,
            ),
          });
        },
      };
    },
  ),
);

export type BoardStore = InstanceType<typeof BoardStore>;
