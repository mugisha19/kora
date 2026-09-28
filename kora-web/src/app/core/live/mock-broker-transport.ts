import { BehaviorSubject, Observable } from 'rxjs';
import { LiveConnection, LiveCredentials, LiveState, LiveTransport } from './live-transport';

/**
 * The mock API's in-page broker (`src/app/mocks/broker.ts`), found on `globalThis.koraMockBroker`
 * in mock mode and unit tests. It applies the API's rules: CONNECT needs a valid token and a
 * membership, a project topic needs a project you can see; `setOnline(false)` simulates a lost
 * network.
 */
export interface MockBrokerApi {
  open(
    headers: Readonly<Record<string, string>>,
    onOnline: (online: boolean) => void,
  ): MockBrokerSession;
}

export interface MockBrokerSession {
  /** Null when accepted; otherwise the ERROR frame's message (the session is then closed). */
  readonly error: string | null;
  subscribe(destination: string, onMessage: (body: string) => void): MockBrokerSubscription;
  close(): void;
}

export interface MockBrokerSubscription {
  readonly error: string | null;
  unsubscribe(): void;
}

declare global {
  var koraMockBroker: MockBrokerApi | undefined;
}

interface Watcher {
  readonly destination: string;
  readonly next: (body: unknown) => void;
  readonly fail: (error: Error) => void;
  subscription?: MockBrokerSubscription;
}

/**
 * Live updates from the mock broker, with the STOMP transport's behaviour: `connecting`, then
 * `online`; `offline` while the simulated network is down; on the way back it reconnects with the
 * current token and resubscribes every watcher.
 */
export class MockBrokerTransport implements LiveTransport {
  connect(credentials: () => LiveCredentials | null): LiveConnection {
    const state$ = new BehaviorSubject<LiveState>('connecting');
    const watchers = new Set<Watcher>();
    let session: MockBrokerSession | null = null;
    let closed = false;

    const attach = (watcher: Watcher) => {
      if (!session) return;
      const subscription = session.subscribe(watcher.destination, (body) =>
        watcher.next(JSON.parse(body) as unknown),
      );
      if (subscription.error) watcher.fail(new Error(subscription.error));
      else watcher.subscription = subscription;
    };

    const open = () => {
      const broker = globalThis.koraMockBroker;
      const current = credentials();
      if (!broker || !current) {
        state$.next('offline');
        return;
      }
      session?.close();
      session = broker.open(
        {
          Authorization: `Bearer ${current.accessToken}`,
          'X-Organization-Id': current.organizationId,
        },
        (online) => {
          if (closed) return;
          if (online) open();
          else {
            session?.close();
            session = null;
            state$.next('offline');
          }
        },
      );
      if (session.error) {
        session = null;
        state$.next('offline');
        return;
      }
      state$.next('online');
      for (const watcher of watchers) attach(watcher);
    };

    // Asynchronous like a real socket, so callers subscribe to the state before it changes.
    queueMicrotask(() => {
      if (!closed) open();
    });

    return {
      state$: state$.asObservable(),
      watch: (destination: string) =>
        new Observable<unknown>((subscriber) => {
          const watcher: Watcher = {
            destination,
            next: (body) => subscriber.next(body),
            fail: (error) => subscriber.error(error),
          };
          watchers.add(watcher);
          attach(watcher);
          return () => {
            watchers.delete(watcher);
            watcher.subscription?.unsubscribe();
          };
        }),
      close: () => {
        closed = true;
        session?.close();
        session = null;
        state$.next('offline');
        state$.complete();
      },
    };
  }
}
