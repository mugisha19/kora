import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription, firstValueFrom } from 'rxjs';
import { ActivityEntry } from '../../../../core/api/api.models';
import { AuditApi } from '../../../../core/api/audit.api';
import { ChangeFormat } from '../../../../core/audit/change-format';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LiveUpdates } from '../../../../core/live/live-updates';
import { OrgDirectory } from '../../../../core/people/org-directory';
import { OrgClock } from '../../../../core/session/org-clock';
import { plusDays } from '../../../../shared/format/iso-week';
import { dayOf, relativeTime } from '../../../../shared/format/relative-time';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';

const PAGE_SIZE = 30;

/** Where an item of each kind opens in the workspace. */
const ITEM_PATHS: Readonly<Record<string, string>> = {
  task: 'tasks',
  risk: 'risks',
  issue: 'issues',
  'change-request': 'change-requests',
};

/**
 * The project's activity feed (feature 18): who did what, newest first, grouped by day in the
 * organization's time zone. New entries arrive live (Observer over STOMP) and are announced
 * politely; after a lost connection the feed reloads to catch up.
 */
@Component({
  selector: 'kora-activity-tab',
  imports: [EmptyState, ErrorState, LoadingState, MatButton, MatIcon, RouterLink, TranslocoPipe],
  template: `
    <section aria-labelledby="activity-title">
      <h2 id="activity-title" class="visually-hidden">{{ 'activity.title' | transloco }}</h2>
      @if (state() === 'error' && !entries().length) {
        <kora-error-state (retry)="load()" />
      } @else if (state() === 'loading' && !entries().length) {
        <kora-loading-state />
      } @else if (!entries().length) {
        <kora-empty-state
          icon="dynamic_feed"
          [heading]="'activity.emptyTitle' | transloco"
          [message]="'activity.emptyMessage' | transloco"
        />
      } @else {
        @for (group of groups(); track group.day) {
          <section [attr.aria-labelledby]="'activity-' + group.day">
            <h3 class="day" [id]="'activity-' + group.day">{{ group.label }}</h3>
            <ol class="feed">
              @for (e of group.items; track e.id) {
                <li>
                  <mat-icon class="kind" [svgIcon]="icon(e)" aria-hidden="true" />
                  <p>
                    <strong>{{ actor(e) }}</strong>
                    {{ 'activity.verb.' + verb(e) | transloco }}
                    {{ type(e) }}
                    @if (link(e); as path) {
                      <a [routerLink]="path">{{
                        e.entityLabel ?? ('activity.item' | transloco)
                      }}</a>
                    } @else if (e.entityLabel) {
                      <span class="label">{{ e.entityLabel }}</span>
                    }
                    @if (fields(e); as list) {
                      <!-- After a key "AKG-1: status"; without one "(status)". -->
                      <span class="fields">{{
                        e.entityLabel ? ': ' + list : '(' + list + ')'
                      }}</span>
                    }
                    <time [attr.datetime]="e.occurredAt">{{ ago(e.occurredAt) }}</time>
                  </p>
                </li>
              }
            </ol>
          </section>
        }
        @if (cursor()) {
          <button
            mat-stroked-button
            type="button"
            class="more"
            [disabled]="loadingMore()"
            (click)="loadMore()"
          >
            {{ 'activity.older' | transloco }}
          </button>
        }
      }
    </section>
  `,
  styles: `
    .day {
      margin: var(--kora-space-4) 0 var(--kora-space-1);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-title-small);
    }
    .feed {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--kora-space-2);
      padding-block: var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    .kind {
      flex: none;
      color: var(--mat-sys-on-surface-variant);
    }
    p {
      margin: 0;
      font: var(--mat-sys-body-medium);
      overflow-wrap: anywhere;
    }
    .fields {
      color: var(--mat-sys-on-surface-variant);
    }
    time {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .more {
      margin-block-start: var(--kora-space-3);
    }
  `,
})
export class ActivityTab {
  private readonly project = inject(ProjectStore);
  private readonly api = inject(AuditApi);
  private readonly live = inject(LiveUpdates);
  private readonly format = inject(ChangeFormat);
  private readonly language = inject(LanguageService);
  private readonly directory = inject(OrgDirectory);
  private readonly clock = inject(OrgClock);
  private readonly transloco = inject(TranslocoService);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly entries = signal<ActivityEntry[]>([]);
  protected readonly cursor = signal<string | undefined>(undefined);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadingMore = signal(false);
  private readonly projectId = computed(() => this.project.projectId() ?? '');

  protected readonly groups = computed(() => {
    const zone = this.directory.timeZone() ?? undefined;
    const today = this.clock.today();
    const yesterday = plusDays(today, -1);
    const groups: { day: string; label: string; items: ActivityEntry[] }[] = [];
    for (const e of this.entries()) {
      const day = dayOf(e.occurredAt, zone);
      let group = groups.find((g) => g.day === day);
      if (!group) {
        const label =
          day === today
            ? this.transloco.translate('notifications.today')
            : day === yesterday
              ? this.transloco.translate('notifications.yesterday')
              : new Intl.DateTimeFormat(this.language.current(), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }).format(new Date(`${day}T00:00:00Z`));
        group = { day, label, items: [] };
        groups.push(group);
      }
      group.items.push(e);
    }
    return groups;
  });

  constructor() {
    let watching: Subscription | undefined;
    effect(() => {
      const projectId = this.projectId();
      untracked(() => {
        watching?.unsubscribe();
        if (!projectId) return;
        void this.load();
        watching = this.live.projectActivity(projectId).subscribe((e) => this.receive(e));
      });
    });
    const reconnected = this.live.reconnected$.subscribe(() => void this.load());
    inject(DestroyRef).onDestroy(() => {
      watching?.unsubscribe();
      reconnected.unsubscribe();
    });
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const page = await firstValueFrom(this.api.activity(this.projectId(), undefined, PAGE_SIZE));
      this.entries.set(page.items);
      this.cursor.set(page.nextCursor);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (!cursor) return;
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(this.api.activity(this.projectId(), cursor, PAGE_SIZE));
      const known = new Set(this.entries().map((e) => e.id));
      this.entries.update((list) => [...list, ...page.items.filter((e) => !known.has(e.id))]);
      this.cursor.set(page.nextCursor);
    } finally {
      this.loadingMore.set(false);
    }
  }

  private receive(entry: ActivityEntry): void {
    if (this.entries().some((e) => e.id === entry.id)) return;
    this.entries.update((list) => [entry, ...list]);
    void this.announcer.announce(
      this.transloco.translate('activity.arrived', { text: this.sentence(entry) }),
      'polite',
    );
  }

  protected actor(e: ActivityEntry): string {
    return e.actor?.fullName ?? this.transloco.translate('history.system');
  }

  protected verb(e: ActivityEntry): string {
    return e.action.slice(e.action.lastIndexOf('.') + 1);
  }

  protected type(e: ActivityEntry): string {
    return this.format.entityLabel(e.entityType).toLowerCase();
  }

  protected fields(e: ActivityEntry): string {
    return this.verb(e) === 'updated' ? this.format.fieldList(e.changedFields) : '';
  }

  protected link(e: ActivityEntry): string | null {
    const segment = ITEM_PATHS[e.entityType];
    return segment && this.verb(e) !== 'deleted'
      ? `/projects/${this.projectId()}/${segment}/${e.entityId}`
      : null;
  }

  protected icon(e: ActivityEntry): string {
    const verb = this.verb(e);
    return verb === 'created' ? 'add' : verb === 'deleted' ? 'delete' : 'edit';
  }

  protected ago(iso: string): string {
    return relativeTime(iso, this.language.current());
  }

  private sentence(e: ActivityEntry): string {
    const fields = this.fields(e);
    return [
      this.actor(e),
      this.transloco.translate(`activity.verb.${this.verb(e)}`),
      this.type(e),
      e.entityLabel ?? '',
    ]
      .filter(Boolean)
      .join(' ')
      .concat(fields ? `: ${fields}` : '');
  }
}
