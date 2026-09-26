import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionFacade } from '../session/session.facade';
import { SessionStore } from '../session/session.store';

/** Initials of up to two words: "Aline Uwase" → "AU". */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/** Account menu: who is signed in, settings, sign out. */
@Component({
  selector: 'kora-user-menu',
  imports: [
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    @if (store.user(); as user) {
      <button
        mat-icon-button
        type="button"
        class="avatar"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="'userMenu.label' | transloco: { name: user.fullName }"
      >
        <span aria-hidden="true">{{ userInitials() }}</span>
      </button>
      <mat-menu #menu="matMenu" xPosition="before">
        <div class="who">
          <span class="name">{{ user.fullName }}</span>
          <span class="email">{{ user.email }}</span>
        </div>
        <a mat-menu-item routerLink="/settings">
          <mat-icon svgIcon="settings" aria-hidden="true" />
          <span>{{ 'userMenu.settings' | transloco }}</span>
        </a>
        <button mat-menu-item type="button" (click)="signOut()">
          <mat-icon svgIcon="logout" aria-hidden="true" />
          <span>{{ 'userMenu.signOut' | transloco }}</span>
        </button>
      </mat-menu>
    }
  `,
  styles: `
    .avatar span {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 50%;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-large);
    }
    .who {
      display: flex;
      flex-direction: column;
      padding: var(--kora-space-2) var(--kora-space-4) var(--kora-space-3);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .email {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class UserMenu {
  protected readonly store = inject(SessionStore);
  private readonly session = inject(SessionFacade);

  protected readonly userInitials = computed(() => initials(this.store.user()?.fullName ?? ''));

  protected signOut(): void {
    void this.session.signOut();
  }
}
