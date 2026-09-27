import { Component, inject } from '@angular/core';
import { MatIconAnchor } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApprovalsInbox } from '../approvals/approvals-inbox';

/**
 * Toolbar link to "My approvals" with the number of change requests waiting for a decision. The
 * count is in the link's name for screen readers; the badge is its visual copy.
 */
@Component({
  selector: 'kora-approvals-button',
  imports: [MatIcon, MatIconAnchor, MatTooltip, RouterLink, TranslocoPipe],
  template: `
    <a
      mat-icon-button
      routerLink="/approvals"
      [matTooltip]="'approvals.title' | transloco"
      [attr.aria-label]="'approvals.link' | transloco: { count: inbox.count() }"
    >
      <mat-icon svgIcon="approval" aria-hidden="true" />
      @if (inbox.count()) {
        <span class="badge" aria-hidden="true">{{ inbox.count() }}</span>
      }
    </a>
  `,
  styles: `
    a {
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
export class ApprovalsButton {
  protected readonly inbox = inject(ApprovalsInbox);
}
