import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionFacade } from '../session/session.facade';
import { SessionStore } from '../session/session.store';

/**
 * Toolbar organization switcher (feature 02): the active organization and your role there; the
 * menu lists every membership. Switching changes the `X-Organization-Id` of every later request,
 * opens that organization's dashboard, announces the change and is remembered on this device.
 */
@Component({
  selector: 'kora-org-switcher',
  imports: [MatButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, TranslocoPipe],
  template: `
    @if (store.activeMembership(); as current) {
      <button mat-button type="button" class="trigger" [matMenuTriggerFor]="menu">
        <mat-icon svgIcon="corporate_fare" aria-hidden="true" />
        <!-- Angular strips whitespace between elements, so separators are explicit for screen readers. -->
        <span class="visually-hidden">{{ 'orgSwitcher.label' | transloco }}: </span>
        <span class="name">{{ current.organizationName }}</span>
        <span class="visually-hidden">, </span>
        <span class="role">{{ 'roles.' + current.role | transloco }}</span>
        <mat-icon
          class="chevron"
          iconPositionEnd
          svgIcon="keyboard_arrow_down"
          aria-hidden="true"
        />
      </button>
      <mat-menu #menu="matMenu">
        @for (membership of store.memberships(); track membership.organizationId) {
          <button
            mat-menu-item
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="membership.organizationId === current.organizationId"
            (click)="switchTo(membership.organizationId)"
          >
            <span class="option">
              <span>{{ membership.organizationName }}</span>
              <span class="visually-hidden">, </span>
              <span class="option-role">{{ 'roles.' + membership.role | transloco }}</span>
            </span>
            @if (membership.organizationId === current.organizationId) {
              <mat-icon class="check" svgIcon="check" aria-hidden="true" />
            }
          </button>
        }
      </mat-menu>
    }
  `,
  styles: `
    .name {
      display: inline-block;
      max-inline-size: 16rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
    }
    .role {
      margin-inline-start: var(--kora-space-2);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
    }
    .option {
      display: inline-flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .option-role {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .check {
      margin-inline: var(--kora-space-4) 0;
    }
    /* Phones: the icon alone, so the toolbar fits in 375 px; the name stays in the accessible name. */
    @media (max-width: 600px) {
      .name {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .role,
      .trigger .chevron {
        display: none;
      }
      .trigger {
        min-inline-size: 48px;
        padding-inline: var(--kora-space-3);
      }
    }
  `,
})
export class OrgSwitcher {
  protected readonly store = inject(SessionStore);
  private readonly session = inject(SessionFacade);

  protected switchTo(organizationId: string): void {
    if (organizationId !== this.store.activeOrganizationId()) {
      void this.session.switchOrganization(organizationId);
    }
  }
}
