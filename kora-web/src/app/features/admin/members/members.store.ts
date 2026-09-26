import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import {
  EMPTY,
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  pipe,
  switchMap,
  tap,
} from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import { MEMBER_SORT_FIELDS, Member, MemberPage, Role } from '../../../core/api/api.models';
import { MembersApi } from '../../../core/api/members.api';
import { Notifier } from '../../../core/notify/notifier';

export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export interface MembersQuery {
  q: string;
  role: Role | null;
  page: number;
  size: number;
  sortField: MemberSortField;
  sortDirection: SortDirection;
}

interface MembersState {
  query: MembersQuery;
  result: MemberPage | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  /** Members with a change in flight; their controls are disabled. */
  busyIds: string[];
}

const initialState: MembersState = {
  query: { q: '', role: null, page: 0, size: 20, sortField: 'fullName', sortDirection: 'asc' },
  result: null,
  status: 'loading',
  error: null,
  busyIds: [],
};

/**
 * Members tab state (feature 03), provided by the page so it lives and dies with the route.
 * The query is the single source of truth: any change reloads the page from the server
 * (search, filter, sort and paging are all server-side).
 */
export const MembersStore = signalStore(
  withState(initialState),
  withComputed(({ result }) => ({
    members: computed(() => result()?.content ?? []),
    total: computed(() => result()?.totalElements ?? 0),
  })),
  withMethods(
    (
      store,
      api = inject(MembersApi),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
    ) => {
      const setQuery = (change: Partial<MembersQuery>) =>
        patchState(store, { query: { ...store.query(), ...change } });

      const load = rxMethod<MembersQuery>(
        pipe(
          tap(() => patchState(store, { status: 'loading', error: null })),
          switchMap((query) =>
            api
              .list({
                q: query.q || undefined,
                role: query.role ?? undefined,
                page: query.page,
                size: query.size,
                sort: [`${query.sortField},${query.sortDirection}`],
              })
              .pipe(
                tap((result) => patchState(store, { result, status: 'ready' })),
                catchError((error: unknown) => {
                  patchState(store, { status: 'error', error: toApiError(error) });
                  return EMPTY;
                }),
              ),
          ),
        ),
      );

      /** Typing in the search box: wait for a pause, then search from the first page. */
      const search = rxMethod<string>(
        pipe(
          debounceTime(300),
          distinctUntilChanged(),
          tap((q) => setQuery({ q: q.trim(), page: 0 })),
        ),
      );

      const busy = (id: string, on: boolean) =>
        patchState(store, {
          busyIds: on ? [...store.busyIds(), id] : store.busyIds().filter((b) => b !== id),
        });

      const replace = (member: Member) => {
        const result = store.result();
        if (!result) return;
        patchState(store, {
          result: {
            ...result,
            content: result.content.map((m) => (m.id === member.id ? member : m)),
          },
        });
      };

      return {
        load,
        search,
        filterRole: (role: Role | null) => setQuery({ role, page: 0 }),
        sortBy: (sortField: MemberSortField, sortDirection: SortDirection) =>
          setQuery({ sortField, sortDirection, page: 0 }),
        setPage: (page: number, size: number) => setQuery({ page, size }),
        reload: () => load(store.query()),

        /**
         * Changes a role. Failures are already toasted by the error interceptor; here the row is
         * put back (a stale version reloads the list, since someone else changed it first).
         */
        async changeRole(member: Member, role: Role): Promise<boolean> {
          busy(member.id, true);
          try {
            const updated = await firstValueFrom(api.changeRole(member.id, role, member.version));
            replace(updated);
            notifier.success(
              transloco.translate('admin.members.roleChanged', {
                name: updated.fullName,
                role: transloco.translate(`roles.${updated.role}`),
              }),
            );
            return true;
          } catch (error: unknown) {
            if (toApiError(error).status === 412) {
              load(store.query());
            } else {
              // A new object makes the row's select show the unchanged role again.
              replace({ ...member });
            }
            return false;
          } finally {
            busy(member.id, false);
          }
        },

        async remove(member: Member): Promise<boolean> {
          busy(member.id, true);
          try {
            await firstValueFrom(api.remove(member.id));
            notifier.success(
              transloco.translate('admin.members.removed', { name: member.fullName }),
            );
            load(store.query());
            return true;
          } catch {
            return false;
          } finally {
            busy(member.id, false);
          }
        },
      };
    },
  ),
  withHooks({
    onInit(store) {
      store.load(store.query);
    },
  }),
);

export type MembersStore = InstanceType<typeof MembersStore>;
