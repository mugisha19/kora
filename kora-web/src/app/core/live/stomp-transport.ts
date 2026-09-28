import { BehaviorSubject, Observable, from, map, switchMap } from 'rxjs';
import { LiveConnection, LiveCredentials, LiveState, LiveTransport } from './live-transport';

/** Longest wait between reconnect attempts; the first waits one second, then it doubles. */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** `/ws` on the page's own origin (the dev proxy and Nginx forward it to the API). */
function brokerUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}

/**
 * STOMP over WebSocket to the real API with `@stomp/rx-stomp`, loaded on first use so it isn't in
 * the initial bundle. Reconnects with exponential backoff and sends the current access token on
 * every CONNECT; `watch` resubscribes by itself after a reconnect.
 */
export class StompTransport implements LiveTransport {
  connect(credentials: () => LiveCredentials | null): LiveConnection {
    const state$ = new BehaviorSubject<LiveState>('connecting');
    const stomp = import('@stomp/rx-stomp').then(
      ({ RxStomp, RxStompState, ReconnectionTimeMode }) => {
        const client = new RxStomp();
        client.configure({
          brokerURL: brokerUrl(),
          reconnectDelay: 1_000,
          maxReconnectDelay: MAX_RECONNECT_DELAY_MS,
          reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
          heartbeatIncoming: 20_000,
          heartbeatOutgoing: 20_000,
          beforeConnect: (rx) => {
            const current = credentials();
            if (!current) {
              void rx.deactivate();
              return;
            }
            rx.configure({
              connectHeaders: {
                Authorization: `Bearer ${current.accessToken}`,
                'X-Organization-Id': current.organizationId,
              },
            });
          },
        });
        client.connectionState$.subscribe((state) =>
          state$.next(
            state === RxStompState.OPEN
              ? 'online'
              : state === RxStompState.CONNECTING
                ? 'connecting'
                : 'offline',
          ),
        );
        client.activate();
        return client;
      },
    );

    return {
      state$: state$.asObservable(),
      watch: (destination: string): Observable<unknown> =>
        from(stomp).pipe(
          switchMap((client) => client.watch({ destination })),
          map((message) => JSON.parse(message.body) as unknown),
        ),
      close: () => {
        void stomp.then((client) => client.deactivate());
        state$.next('offline');
        state$.complete();
      },
    };
  }
}
