import { Component } from '@angular/core';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PageHeader } from '../../shared/ui/page-header';

/** Administration (feature 03): one page with a tab per section, each tab its own route. */
@Component({
  selector: 'kora-admin-layout',
  imports: [
    MatTabLink,
    MatTabNav,
    MatTabNavPanel,
    PageHeader,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  template: `
    <kora-page-header
      [heading]="'admin.title' | transloco"
      [subtitle]="'admin.subtitle' | transloco"
    />
    <nav
      mat-tab-nav-bar
      data-keep-focus
      [tabPanel]="panel"
      [attr.aria-label]="'admin.tabs.label' | transloco"
    >
      @for (tab of tabs; track tab.path) {
        <a
          mat-tab-link
          [routerLink]="tab.path"
          routerLinkActive
          #link="routerLinkActive"
          [active]="link.isActive"
        >
          {{ tab.label | transloco }}
        </a>
      }
    </nav>
    <mat-tab-nav-panel #panel class="panel">
      <router-outlet />
    </mat-tab-nav-panel>
  `,
  styles: `
    .panel {
      display: block;
      padding-block-start: var(--kora-space-6);
    }
  `,
})
export class AdminLayout {
  protected readonly tabs = [
    { path: 'members', label: 'admin.tabs.members' },
    { path: 'invitations', label: 'admin.tabs.invitations' },
    { path: 'organization', label: 'admin.tabs.organization' },
  ] as const;
}
