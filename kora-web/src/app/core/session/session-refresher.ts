import { Injectable, inject } from '@angular/core';
import { Observable, Subject, catchError, finalize, shareReplay, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth.api';
import { SessionResponse } from '../api/api.models';
import { SessionStore } from './session.store';

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
  private readonly expiredSubject = new Subject<void>();
  private inFlight: Observable<SessionResponse> | null = null;

  /** Emits when a session that existed could not be renewed (the user must sign in again). */
  readonly expired$ = this.expiredSubject.asObservable();

  refresh(): Observable<SessionResponse> {
    this.inFlight ??= this.api.refresh().pipe(
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
