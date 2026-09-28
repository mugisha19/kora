import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { AppNotification } from '../api/api.models';
import { NotificationsApi } from '../api/notifications.api';
import { LiveUpdates } from '../live/live-updates';
import { SessionStore } from '../session/session.store';
import { NotificationText } from './notification-text';

const PAGE_SIZE = 20;

/**
 * My notifications (feature 18) for the toolbar bell and its panel: the first page per
 * organization, more on request, new ones as they arrive live (announced politely, never taking
 * focus), and a reload after the live connection comes back, to catch up on what was missed.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly api = inject(NotificationsApi);
  private readonly session = inject(SessionStore);
  private readonly live = inject(LiveUpdates);
  private readonly text = inject(NotificationText);
  private readonly announcer = inject(LiveAnnouncer);

  private readonly list = signal<AppNotification[]>([]);
  private readonly unread = signal(0);
  private readonly cursor = signal<string | undefined>(undefined);
  private readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly more = signal(false);

  readonly items = this.list.asReadonly();
  readonly unreadCount = this.unread.asReadonly();
  readonly status = this.state.asReadonly();
  readonly loadingMore = this.more.asReadonly();
  readonly hasMore = computed(() => this.cursor() !== undefined);
  /** Each notification as it arrives live (the reports page and approvals refresh on theirs). */
  readonly arrived$ = new Subject<AppNotification>();

  constructor() {
    effect(() => {
      const organizationId = this.session.activeOrganizationId();
      const signedIn = this.session.isAuthenticated();
      untracked(() => {
        this.list.set([]);
        this.unread.set(0);
        this.cursor.set(undefined);
        this.state.set('idle');
        if (signedIn && organizationId) void this.load();
      });
    });
    this.live.notifications$.subscribe((notification) => this.receive(notification));
    this.live.reconnected$.subscribe(() => void this.load());
  }

  /** The first page (again): after an organization change or a reconnect. */
  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const page = await firstValueFrom(this.api.list({ limit: PAGE_SIZE }));
      this.list.set(page.items);
      this.unread.set(page.unreadCount);
      this.cursor.set(page.nextCursor);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (!cursor || this.more()) return;
    this.more.set(true);
    try {
      const page = await firstValueFrom(this.api.list({ limit: PAGE_SIZE, cursor }));
      const known = new Set(this.list().map((n) => n.id));
      this.list.update((list) => [...list, ...page.items.filter((n) => !known.has(n.id))]);
      this.unread.set(page.unreadCount);
      this.cursor.set(page.nextCursor);
    } finally {
      this.more.set(false);
    }
  }

  async markRead(notification: AppNotification): Promise<void> {
    if (notification.readAt) return;
    this.setRead([notification.id], new Date().toISOString());
    try {
      const saved = await firstValueFrom(this.api.markRead(notification.id));
      this.list.update((list) => list.map((n) => (n.id === saved.id ? saved : n)));
    } catch {
      // The interceptor explains; the next load shows the true state.
      void this.load();
    }
  }

  async markAllRead(): Promise<void> {
    const unread = this.list().filter((n) => !n.readAt);
    this.setRead(
      unread.map((n) => n.id),
      new Date().toISOString(),
    );
    this.unread.set(0);
    try {
      await firstValueFrom(this.api.markAllRead());
    } catch {
      void this.load();
    }
  }

  private receive(notification: AppNotification): void {
    if (this.list().some((n) => n.id === notification.id)) return;
    this.list.update((list) => [notification, ...list]);
    if (!notification.readAt) this.unread.update((count) => count + 1);
    void this.announcer.announce(this.text.describe(notification), 'polite');
    this.arrived$.next(notification);
  }

  private setRead(ids: readonly string[], readAt: string): void {
    const wanted = new Set(ids);
    let changed = 0;
    this.list.update((list) =>
      list.map((n) => {
        if (!wanted.has(n.id) || n.readAt) return n;
        changed++;
        return { ...n, readAt };
      }),
    );
    this.unread.update((count) => Math.max(0, count - changed));
  }
}
