import {
  MockBrokerApi,
  MockBrokerSession,
  MockBrokerSubscription,
} from '../core/live/mock-broker-transport';
import { db } from './db';
import { userIdFromBearer } from './http';
import { canSee } from './projects-domain';

const USER_QUEUE = '/user/queue/notifications';
const PROJECT_TOPIC = /^\/topic\/projects\/([0-9a-f-]{36})$/;

interface Listener {
  readonly destination: string;
  readonly onMessage: (body: string) => void;
}

class Session implements MockBrokerSession {
  readonly listeners = new Set<Listener>();
  closed = false;

  constructor(
    private readonly broker: MockBroker,
    readonly userId: string,
    readonly organizationId: string,
    readonly onOnline: (online: boolean) => void,
    readonly error: string | null = null,
  ) {}

  subscribe(destination: string, onMessage: (body: string) => void): MockBrokerSubscription {
    const refused = this.closed ? 'Not connected' : this.broker.refusal(this, destination);
    if (refused) {
      return { error: refused, unsubscribe: () => undefined };
    }
    const listener: Listener = { destination, onMessage };
    this.listeners.add(listener);
    return { error: null, unsubscribe: () => this.listeners.delete(listener) };
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.broker.forget(this);
  }
}

/**
 * The mock API's stand-in for the STOMP broker on `/ws`, with the API's rules: CONNECT needs a
 * valid access token and a membership of the organization; `/user/queue/notifications` gets the
 * connected person's notifications in that organization; `/topic/projects/<id>` is refused
 * unless they can see the project. `setOnline(false)` simulates a lost network (messages are
 * dropped, as they would be); `setOnline(true)` lets clients reconnect and catch up.
 */
export class MockBroker implements MockBrokerApi {
  private readonly sessions = new Set<Session>();
  private online = true;
  /** Clients cut off by a lost network, told when it comes back so they reconnect. */
  private readonly waiting = new Set<(online: boolean) => void>();

  open(
    headers: Readonly<Record<string, string>>,
    onOnline: (online: boolean) => void,
  ): MockBrokerSession {
    const userId = userIdFromBearer(headers['Authorization'] ?? '');
    const organizationId = headers['X-Organization-Id'] ?? '';
    const refused = !this.online
      ? 'Connection lost'
      : !userId
        ? 'Unauthenticated'
        : !db.membership(userId, organizationId)
          ? 'Not a member of this organization'
          : null;
    const session = new Session(this, userId ?? '', organizationId, onOnline, refused);
    if (!refused) this.sessions.add(session);
    else session.closed = true;
    if (!this.online) this.waiting.add(onOnline);
    return session;
  }

  refusal(session: Session, destination: string): string | null {
    if (destination === USER_QUEUE) return null;
    const projectId = PROJECT_TOPIC.exec(destination)?.[1];
    const project = projectId ? db.state.projects.find((p) => p.id === projectId) : undefined;
    const membership = db.membership(session.userId, session.organizationId);
    return project && membership && canSee(project, membership) ? null : 'Access denied';
  }

  forget(session: Session): void {
    this.sessions.delete(session);
  }

  /** A new notification, to its person's connections in its organization. */
  toUser(userId: string, organizationId: string, body: unknown): void {
    this.deliver(
      (s) => s.userId === userId && s.organizationId === organizationId,
      USER_QUEUE,
      body,
    );
  }

  /** New activity, to everyone watching the project. */
  toProject(projectId: string, body: unknown): void {
    this.deliver(() => true, `/topic/projects/${projectId}`, body);
  }

  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    if (!online) {
      for (const session of [...this.sessions]) {
        session.close();
        this.waiting.add(session.onOnline);
        session.onOnline(false);
      }
      return;
    }
    const reconnect = [...this.waiting];
    this.waiting.clear();
    for (const onOnline of reconnect) onOnline(true);
  }

  isOnline(): boolean {
    return this.online;
  }

  private deliver(match: (session: Session) => boolean, destination: string, body: unknown): void {
    if (!this.online) return;
    const text = JSON.stringify(body);
    for (const session of this.sessions) {
      if (!match(session)) continue;
      for (const listener of session.listeners) {
        if (listener.destination === destination) listener.onMessage(text);
      }
    }
  }
}

export const broker = new MockBroker();

/** Makes the broker reachable for `MockBrokerTransport` (mock mode and unit tests). */
export function installMockBroker(): void {
  globalThis.koraMockBroker = broker;
}
