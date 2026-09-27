import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ListProjectsQuery, ProjectPage } from '../../core/api/api.models';
import { ProjectsApi } from '../../core/api/projects.api';

interface ProjectsState {
  query: ListProjectsQuery | null;
  result: ProjectPage | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
}

const initialState: ProjectsState = { query: null, result: null, status: 'loading', error: null };

/**
 * Projects list state (feature 04), provided by the page. The query comes from the URL; every
 * change reloads from the server (filters, sort and paging are server-side) and cancels the
 * previous request.
 */
export const ProjectsStore = signalStore(
  withState(initialState),
  withComputed(({ result }) => ({
    projects: computed(() => result()?.content ?? []),
    total: computed(() => result()?.totalElements ?? 0),
  })),
  withMethods((store, api = inject(ProjectsApi)) => {
    const load = rxMethod<ListProjectsQuery>(
      pipe(
        tap((query) => patchState(store, { query, status: 'loading', error: null })),
        switchMap((query) =>
          api.list(query).pipe(
            tap((result) => patchState(store, { result, status: 'ready' })),
            catchError((error: unknown) => {
              patchState(store, { status: 'error', error: toApiError(error) });
              return EMPTY;
            }),
          ),
        ),
      ),
    );
    return {
      load,
      reload: () => {
        const query = store.query();
        if (query) load(query);
      },
    };
  }),
);

export type ProjectsStore = InstanceType<typeof ProjectsStore>;
