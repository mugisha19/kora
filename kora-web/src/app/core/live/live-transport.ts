import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockBrokerTransport } from './mock-broker-transport';
import { StompTransport } from './stomp-transport';

/** Whether live updates are flowing: `offline` shows the banner; lists catch up when back online. */
export type LiveState = 'connecting' | 'online' | 'offline';

/** What the server checks on CONNECT; read at every (re)connect, so a refreshed token is used. */
export interface LiveCredentials {
  readonly accessToken: string;
  readonly organizationId: string;
}

export interface LiveConnection {
  readonly state$: Observable<LiveState>;
  /**
   * Message bodies (parsed JSON) sent to a destination. Survives reconnects; errors if the server
   * refuses the subscription.
   */
  watch(destination: string): Observable<unknown>;
  close(): void;
}

/**
 * How live updates reach the browser. The real API speaks STOMP over `/ws`; the mock API has an
 * in-page broker with the same rules (authenticate on connect, only projects you can see).
 */
export interface LiveTransport {
  connect(credentials: () => LiveCredentials | null): LiveConnection;
}

export const LIVE_TRANSPORT = new InjectionToken<LiveTransport>('LIVE_TRANSPORT', {
  providedIn: 'root',
  factory: () => (environment.useMocks ? new MockBrokerTransport() : new StompTransport()),
});
