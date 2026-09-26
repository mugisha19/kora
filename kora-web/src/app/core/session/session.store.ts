import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { MeResponse, SessionResponse } from '../api/api.models';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../storage/preferences';
import { NOW } from './clock';

interface SessionState {
  /** JWT, in memory only: never in storage, where an XSS payload could read it (feature 01). */
  accessToken: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number | null;
  user: MeResponse | null;
  /** Sent as `X-Organization-Id`; not part of the token, so switching needs no new token. */
  activeOrganizationId: string | null;
}

const signedOut: SessionState = {
  accessToken: null,
  expiresAt: null,
  user: null,
  activeOrganizationId: null,
};

/**
 * The organization to use: the one remembered on this device, else the current one, else the
 * first membership. Only organizations the user still belongs to qualify.
 */
function chooseOrganization(user: MeResponse, current: string | null): string | null {
  const isMember = (id: string | null) =>
    id !== null && user.memberships.some((m) => m.organizationId === id);
  const remembered = readPreference(PREFERENCE_KEYS.organization);
  if (isMember(remembered)) return remembered;
  if (isMember(current)) return current;
  return user.memberships[0]?.organizationId ?? null;
}

export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState(signedOut),
  withComputed(({ accessToken, user, activeOrganizationId }) => ({
    isAuthenticated: computed(() => accessToken() !== null && user() !== null),
    memberships: computed(() => user()?.memberships ?? []),
    activeMembership: computed(
      () => user()?.memberships.find((m) => m.organizationId === activeOrganizationId()) ?? null,
    ),
  })),
  withComputed(({ activeMembership }) => ({
    activeRole: computed(() => activeMembership()?.role ?? null),
  })),
  withMethods((store, now = inject(NOW)) => ({
    /** A new or refreshed session from login, register, accept-invitation or refresh. */
    start(session: SessionResponse): void {
      patchState(store, {
        accessToken: session.accessToken,
        expiresAt: now() + session.expiresIn * 1000,
        user: session.user,
        activeOrganizationId: chooseOrganization(session.user, store.activeOrganizationId()),
      });
    },

    /** Fresh `/me` data (profile edit, membership changes). */
    setUser(user: MeResponse): void {
      patchState(store, {
        user,
        activeOrganizationId: chooseOrganization(user, store.activeOrganizationId()),
      });
    },

    /** Switch organization and remember the choice on this device. Ignores non-memberships. */
    switchOrganization(organizationId: string): boolean {
      if (!store.memberships().some((m) => m.organizationId === organizationId)) return false;
      patchState(store, { activeOrganizationId: organizationId });
      writePreference(PREFERENCE_KEYS.organization, organizationId);
      return true;
    },

    /** True when there is a token and it expires within `ms` (or already has). */
    expiresWithin(ms: number): boolean {
      const expiresAt = store.expiresAt();
      return expiresAt !== null && expiresAt - now() <= ms;
    },

    clear(): void {
      patchState(store, signedOut);
    },
  })),
);

export type SessionStore = InstanceType<typeof SessionStore>;
