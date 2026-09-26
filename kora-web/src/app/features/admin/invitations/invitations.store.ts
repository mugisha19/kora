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
import { EMPTY, catchError, firstValueFrom, pipe, switchMap, tap } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import {
  CreateInvitationRequest,
  INVITATION_SORT_FIELDS,
  Invitation,
  InvitationPage,
  InvitationStatus,
} from '../../../core/api/api.models';
import { InvitationsApi } from '../../../core/api/invitations.api';
import { Notifier } from '../../../core/notify/notifier';

export type InvitationSortField = (typeof INVITATION_SORT_FIELDS)[number];

export interface InvitationsQuery {
  /** `null` = all statuses. Pending is what an admin usually needs, so it is the default. */
  status: InvitationStatus | null;
  page: number;
  size: number;
  sortField: InvitationSortField;
  sortDirection: 'asc' | 'desc';
}

interface InvitationsState {
  query: InvitationsQuery;
  result: InvitationPage | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  busyIds: string[];
}

const initialState: InvitationsState = {
  query: { status: 'PENDING', page: 0, size: 20, sortField: 'createdAt', sortDirection: 'desc' },
  result: null,
  status: 'loading',
  error: null,
  busyIds: [],
};

/** Invitations tab state (feature 03), provided by the page. */
export const InvitationsStore = signalStore(
  withState(initialState),
  withComputed(({ result }) => ({
    invitations: computed(() => result()?.content ?? []),
    total: computed(() => result()?.totalElements ?? 0),
  })),
  withMethods(
    (
      store,
      api = inject(InvitationsApi),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
    ) => {
      const setQuery = (change: Partial<InvitationsQuery>) =>
        patchState(store, { query: { ...store.query(), ...change } });

      const load = rxMethod<InvitationsQuery>(
        pipe(
          tap(() => patchState(store, { status: 'loading', error: null })),
          switchMap((query) =>
            api
              .list({
                status: query.status ?? undefined,
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

      const busy = (id: string, on: boolean) =>
        patchState(store, {
          busyIds: on ? [...store.busyIds(), id] : store.busyIds().filter((b) => b !== id),
        });

      return {
        load,
        filterStatus: (status: InvitationStatus | null) => setQuery({ status, page: 0 }),
        sortBy: (sortField: InvitationSortField, sortDirection: 'asc' | 'desc') =>
          setQuery({ sortField, sortDirection, page: 0 }),
        setPage: (page: number, size: number) => setQuery({ page, size }),
        reload: () => load(store.query()),

        /** Rejects with the API error, so the invite dialog can show it next to the field. */
        async create(request: CreateInvitationRequest): Promise<Invitation> {
          const invitation = await firstValueFrom(api.create(request));
          notifier.success(
            transloco.translate('admin.invitations.sent', { email: invitation.email }),
          );
          load(store.query());
          return invitation;
        },

        /** Failures are toasted by the error interceptor; the list reloads either way. */
        async revoke(invitation: Invitation): Promise<boolean> {
          busy(invitation.id, true);
          try {
            await firstValueFrom(api.revoke(invitation.id));
            notifier.success(
              transloco.translate('admin.invitations.revoked', { email: invitation.email }),
            );
            return true;
          } catch {
            return false;
          } finally {
            busy(invitation.id, false);
            load(store.query());
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

export type InvitationsStore = InstanceType<typeof InvitationsStore>;
