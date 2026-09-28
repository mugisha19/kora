import { Component, computed, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AppNotification, NotificationType } from '../api/api.models';
import { LanguageService } from '../i18n/language.service';
import { OrgDirectory } from '../people/org-directory';
import { OrgClock } from '../session/org-clock';
import { dayOf, relativeTime } from '../../shared/format/relative-time';
import { plusDays } from '../../shared/format/iso-week';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { NotificationCenter } from './notification-center';
import { NotificationText } from './notification-text';

/** An icon of its own shape per kind; the sentence always says what happened. */
export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  TASK_ASSIGNED: 'assignment',
  APPROVAL_REQUESTED: 'approval',
  CHANGE_REQUEST_DECIDED: 'fact_check',
  TIMESHEET_DECIDED: 'schedule',
  RISK_REVIEW_OVERDUE: 'event_busy',
  ISSUE_ESCALATED: 'priority_high',
  REPORT_READY: 'summarize',
  REPORT_FAILED: 'error',
};

/**
 * The notification center (feature 18): my notifications grouped by day in the organization's
 * time zone, newest first, each linking to its item. Opening one marks it read.
 */
@Component({
  selector: 'kora-notifications-sheet',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    MatIconButton,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <div class="head">
      <h2 mat-dialog-title>{{ 'notifications.title' | transloco }}</h2>
      <button mat-button type="button" (click)="close()">
        <mat-icon svgIcon="close" aria-hidden="true" />
        {{ 'common.close' | transloco }}
      </button>
    </div>

    <mat-dialog-content tabindex="0">
      <div class="tools">
        <span class="count">{{
          'notifications.unreadCount' | transloco: { count: center.unreadCount() }
        }}</span>
        <button
          mat-button
          type="button"
          [disabled]="!center.unreadCount()"
          (click)="center.markAllRead()"
        >
          <mat-icon svgIcon="done_all" aria-hidden="true" />
          {{ 'notifications.markAllRead' | transloco }}
        </button>
      </div>

      @if (center.status() === 'error' && !center.items().length) {
        <kora-error-state (retry)="center.load()" />
      } @else if (center.status() === 'loading' && !center.items().length) {
        <kora-loading-state />
      } @else if (!center.items().length) {
        <kora-empty-state
          icon="notifications"
          [heading]="'notifications.emptyTitle' | transloco"
          [message]="'notifications.emptyMessage' | transloco"
        />
      } @else {
        @for (group of groups(); track group.day) {
          <section [attr.aria-labelledby]="'day-' + group.day">
            <h3 class="day" [id]="'day-' + group.day">{{ group.label }}</h3>
            <ul>
              @for (n of group.items; track n.id) {
                <li [class.unread]="!n.readAt">
                  <mat-icon class="kind" [svgIcon]="icons[n.type]" aria-hidden="true" />
                  <div class="body">
                    @if (n.link) {
                      <a [routerLink]="n.link" (click)="open(n)">{{ describe(n) }}</a>
                    } @else {
                      <span>{{ describe(n) }}</span>
                    }
                    <span class="meta">
                      @if (!n.readAt) {
                        <span class="dot" aria-hidden="true"></span>
                        <span class="visually-hidden">{{
                          'notifications.unread' | transloco
                        }}</span>
                      }
                      <time [attr.datetime]="n.createdAt">{{ ago(n.createdAt) }}</time>
                    </span>
                  </div>
                  @if (!n.readAt) {
                    <button
                      mat-icon-button
                      type="button"
                      [attr.aria-label]="
                        'notifications.markRead' | transloco: { text: describe(n) }
                      "
                      (click)="center.markRead(n)"
                    >
                      <mat-icon svgIcon="check" aria-hidden="true" />
                    </button>
                  }
                </li>
              }
            </ul>
          </section>
        }
        @if (center.hasMore()) {
          <button
            mat-stroked-button
            type="button"
            class="more"
            [disabled]="center.loadingMore()"
            (click)="center.loadMore()"
          >
            {{ 'notifications.older' | transloco }}
          </button>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions>
      <a mat-button routerLink="/settings" fragment="notifications" (click)="close()">
        <mat-icon svgIcon="settings" aria-hidden="true" />
        {{ 'notifications.settings' | transloco }}
      </a>
    </mat-dialog-actions>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-inline-end: var(--kora-space-3);
    }
    .tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--kora-space-2);
      margin-block-end: var(--kora-space-2);
    }
    .count {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    .day {
      margin: var(--kora-space-3) 0 var(--kora-space-1);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-title-small);
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--kora-space-2);
      padding: var(--kora-space-2);
      border-radius: var(--kora-radius-sm, 8px);
    }
    li.unread {
      background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
    }
    .kind {
      flex: none;
      margin-block-start: 2px;
      color: var(--mat-sys-on-surface-variant);
    }
    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-inline-size: 0;
      font: var(--mat-sys-body-medium);
    }
    .body a {
      color: var(--mat-sys-on-surface);
    }
    li.unread .body a,
    li.unread .body > span:first-child {
      font-weight: 600;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .dot {
      inline-size: 8px;
      block-size: 8px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
    }
    .more {
      margin-block-start: var(--kora-space-3);
    }
  `,
})
export class NotificationsSheet {
  protected readonly center = inject(NotificationCenter);
  protected readonly icons = NOTIFICATION_ICON;
  private readonly text = inject(NotificationText);
  private readonly language = inject(LanguageService);
  private readonly directory = inject(OrgDirectory);
  private readonly clock = inject(OrgClock);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject(MatDialogRef<NotificationsSheet>);

  /** Notifications by day in the organization's time zone: Today, Yesterday, then dates. */
  protected readonly groups = computed(() => {
    const zone = this.directory.timeZone() ?? undefined;
    const today = this.clock.today();
    const yesterday = plusDays(today, -1);
    const locale = this.language.current();
    const groups: { day: string; label: string; items: AppNotification[] }[] = [];
    for (const n of this.center.items()) {
      const day = dayOf(n.createdAt, zone);
      let group = groups.find((g) => g.day === day);
      if (!group) {
        const label =
          day === today
            ? this.transloco.translate('notifications.today')
            : day === yesterday
              ? this.transloco.translate('notifications.yesterday')
              : new Intl.DateTimeFormat(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }).format(new Date(`${day}T00:00:00Z`));
        group = { day, label, items: [] };
        groups.push(group);
      }
      group.items.push(n);
    }
    return groups;
  });

  protected describe(n: AppNotification): string {
    return this.text.describe(n);
  }

  protected ago(iso: string): string {
    return relativeTime(iso, this.language.current());
  }

  protected open(n: AppNotification): void {
    void this.center.markRead(n);
    this.close();
  }

  protected close(): void {
    this.dialogRef.close();
  }
}
