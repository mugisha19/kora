import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, filter, share, switchMap } from 'rxjs';
import { ActivityEntry, AppNotification } from '../api/api.models';
import { SessionStore } from '../session/session.store';
import { LIVE_TRANSPORT, LiveConnection, LiveState } from './live-transport';

/** How long updates may be interrupted before the offline banner shows (reconnects are quick). */
export const OFFLINE_GRACE_MS = 4_000;

/**
 * Live updates (feature 18, Observer): one connection per signed-in organization, opened and
 * replaced as the session changes. Notifications and project activity arrive as observables that
 * survive reconnects; `reconnected$` tells lists to reload what they missed while offline.
 */
@Injectable({ providedIn: 'root' })
export class LiveUpdates {
  private readonly transport = inject(LIVE_TRANSPORT);
  private readonly session = inject(SessionStore);

  private readonly connection = signal<LiveConnection | null>(null);
  private readonly current = signal<LiveState>('offline');
  private readonly lost = signal(false);
  private graceTimer: ReturnType<typeof setTimeout> | undefined;
  private everOnline = false;
  private missed = false;

  readonly state = this.current.asReadonly();
  /** True once updates have been interrupted for a while: the shell shows a banner. */
  readonly offline = computed(() => this.lost() && this.connection() !== null);
  /** The connection came back after being lost: reload lists to catch up. */
  readonly reconnected$ = new Subject<void>();

  private readonly connection$ = toObservable(this.connection);

  /** My new notifications, as they are created. */
  readonly notifications$: Observable<AppNotification> = this.connection$.pipe(
    switchMap((connection) =>
      connection
        ? (connection.watch('/user/queue/notifications') as Observable<AppNotification>)
        : EMPTY,
    ),
    share(),
  );

  constructor() {
    effect(() => {
      const signedIn = this.session.isAuthenticated();
      const organizationId = this.session.activeOrganizationId();
      untracked(() => this.open(signedIn && organizationId ? organizationId : null));
    });
  }

  /** A project's new activity; silent (no error) if the server refuses the subscription. */
  projectActivity(projectId: string): Observable<ActivityEntry> {
    return this.connection$.pipe(
      filter((c): c is LiveConnection => c !== null),
      switchMap(
        (connection) =>
          connection.watch(`/topic/projects/${projectId}`) as Observable<ActivityEntry>,
      ),
      catchError(() => EMPTY),
    );
  }

  private open(organizationId: string | null): void {
    this.connection()?.close();
    clearTimeout(this.graceTimer);
    this.lost.set(false);
    this.everOnline = false;
    this.missed = false;
    if (!organizationId) {
      this.connection.set(null);
      this.current.set('offline');
      return;
    }
    const connection = this.transport.connect(() => {
      const accessToken = this.session.accessToken();
      const active = this.session.activeOrganizationId();
      return accessToken && active ? { accessToken, organizationId: active } : null;
    });
    this.connection.set(connection);
    connection.state$.subscribe((state) => this.onState(connection, state));
  }

  private onState(connection: LiveConnection, state: LiveState): void {
    // A replaced connection's last words (closing) don't count.
    if (connection !== this.connection()) return;
    this.current.set(state);
    if (state === 'online') {
      clearTimeout(this.graceTimer);
      this.graceTimer = undefined;
      this.lost.set(false);
      if (this.missed) this.reconnected$.next();
      this.everOnline = true;
      this.missed = false;
      return;
    }
    if (this.everOnline) this.missed = true;
    this.graceTimer ??= setTimeout(() => {
      this.graceTimer = undefined;
      if (this.current() !== 'online') this.lost.set(true);
    }, OFFLINE_GRACE_MS);
  }
}
