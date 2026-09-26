import { Injectable, InjectionToken, inject } from '@angular/core';
import {
  Observable,
  Subject,
  catchError,
  finalize,
  retry,
  shareReplay,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { toApiError } from '../api/api-error';
import { AuthApi } from '../api/auth.api';
import { SessionResponse } from '../api/api.models';
import { SessionStore } from './session.store';

/**
 * Wait before the one retry of a refresh rejected with `auth.refresh_invalid`. Two tabs sharing the
 * cookie can refresh at the same moment: the API rotates the token for the winner, and the loser's
 * request (carrying the just-rotated token) gets a 401. By the time the loser retries, the winner's
 * new cookie is in the shared cookie jar, so the retry succeeds. The API tolerates such a reuse for
 * 10 s before treating it as theft.
 */
export const REFRESH_RETRY_DELAY_MS = new InjectionToken<number>('REFRESH_RETRY_DELAY_MS', {
  providedIn: 'root',
  factory: () => 200,
});

/**
 * Exchanges the refresh cookie for a new access token, **single-flight**: however many requests
 * need a refresh at the same moment (ten parallel 401s), they share one `/auth/refresh` call.
 * Parallel calls would each rotate the refresh token, and the API treats reuse of a rotated token
 * as theft and revokes the whole session.
 */
@Injectable({ providedIn: 'root' })
export class SessionRefresher {
  private readonly api = inject(AuthApi);
  private readonly store = inject(SessionStore);
  private readonly retryDelayMs = inject(REFRESH_RETRY_DELAY_MS);
  private readonly expiredSubject = new Subject<void>();
  private inFlight: Observable<SessionResponse> | null = null;

  /** Emits when a session that existed could not be renewed (the user must sign in again). */
  readonly expired$ = this.expiredSubject.asObservable();

  refresh(): Observable<SessionResponse> {
    this.inFlight ??= this.api.refresh().pipe(
      retry({
        count: 1,
        delay: (error: unknown) =>
          toApiError(error).code === 'auth.refresh_invalid'
            ? timer(this.retryDelayMs)
            : throwError(() => error),
      }),
      tap((session) => this.store.start(session)),
      catchError((error: unknown) => {
        const hadSession = this.store.isAuthenticated();
        this.store.clear();
        if (hadSession) this.expiredSubject.next();
        return throwError(() => error);
      }),
      finalize(() => (this.inFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inFlight;
  }
}
