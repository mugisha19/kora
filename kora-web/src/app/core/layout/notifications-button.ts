import { Component, Injector, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationCenter } from '../notifications/notification-center';
import { NotificationsSheet } from '../notifications/notifications-sheet';
import { sideSheet } from '../../shared/ui/side-sheet';

/**
 * The toolbar bell: the number of unread notifications (in the button's name for screen readers,
 * the badge is its visual copy) and the notification center in a side sheet.
 */
@Component({
  selector: 'kora-notifications-button',
  imports: [MatIcon, MatIconButton, MatTooltip, TranslocoPipe],
  template: `
    <button
      mat-icon-button
      type="button"
      aria-haspopup="dialog"
      [matTooltip]="'notifications.title' | transloco"
      [attr.aria-label]="
        (center.unreadCount() ? 'notifications.buttonUnread' : 'notifications.button')
          | transloco: { count: center.unreadCount() }
      "
      (click)="open()"
    >
      <mat-icon svgIcon="notifications" aria-hidden="true" />
      @if (center.unreadCount()) {
        <span class="badge" aria-hidden="true">{{
          center.unreadCount() > 99 ? '99+' : center.unreadCount()
        }}</span>
      }
    </button>
  `,
  styles: `
    button {
      position: relative;
    }
    .badge {
      position: absolute;
      inset-block-start: 4px;
      inset-inline-end: 2px;
      min-inline-size: 18px;
      block-size: 18px;
      padding-inline: 4px;
      border-radius: 9px;
      box-sizing: border-box;
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
      font: var(--mat-sys-label-small);
      font-weight: 700;
      line-height: 18px;
      text-align: center;
    }
  `,
})
export class NotificationsButton {
  protected readonly center = inject(NotificationCenter);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  protected open(): void {
    this.dialog.open(NotificationsSheet, sideSheet(undefined, this.injector));
  }
}
