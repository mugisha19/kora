import { Component, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { HealthChip, ProjectStatusChip } from '../../../shared/ui/health-chip';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ProjectStore } from './project.store';

/**
 * `/projects/:projectId/*`: the project header (code, name, status, health) and the tabs its
 * methodology offers (see `METHODOLOGY_STRATEGIES`), with the active tab below. Tabs are links,
 * so each one has its own URL and the browser's back button works.
 */
@Component({
  selector: 'kora-project-workspace',
  imports: [
    EmptyState,
    ErrorState,
    HealthChip,
    LoadingState,
    MatButton,
    MatIcon,
    MatTabLink,
    MatTabNav,
    MatTabNavPanel,
    ProjectStatusChip,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  providers: [ProjectStore],
  template: `
    <a mat-button routerLink="/projects" class="back no-print">
      <mat-icon svgIcon="arrow_back" aria-hidden="true" />
      {{ 'projects.backToList' | transloco }}
    </a>

    @if (store.project(); as project) {
      <header class="head">
        <div class="title">
          <p class="code">{{ project.code }}</p>
          <h1 tabindex="-1">{{ project.name }}</h1>
        </div>
        <div class="chips">
          <kora-project-status-chip [status]="project.status" />
          <kora-health-chip
            [health]="project.health"
            [overridden]="project.healthOverridden"
            [reason]="project.healthReason"
          />
        </div>
      </header>

      <nav
        mat-tab-nav-bar
        data-keep-focus
        class="no-print"
        [tabPanel]="panel"
        [attr.aria-label]="'workspace.tabsLabel' | transloco"
      >
        @for (tab of store.tabs(); track tab) {
          <a
            mat-tab-link
            [routerLink]="tab"
            routerLinkActive
            #active="routerLinkActive"
            [active]="active.isActive"
          >
            {{ 'workspace.tabs.' + tab | transloco }}
          </a>
        }
      </nav>
      <mat-tab-nav-panel #panel class="panel">
        <router-outlet />
      </mat-tab-nav-panel>
    } @else if (store.error()?.status === 404) {
      <kora-empty-state
        icon="search"
        [heading]="'projects.notFoundTitle' | transloco"
        [message]="'projects.notFoundMessage' | transloco"
      />
    } @else if (store.status() === 'error') {
      <kora-error-state [correlationId]="store.error()?.correlationId" (retry)="store.reload()" />
    } @else {
      <kora-loading-state />
    }
  `,
  styles: `
    .back {
      margin-block-end: var(--kora-space-2);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--kora-space-3);
      margin-block-end: var(--kora-space-4);
    }
    .code {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
    }
    h1 {
      font: var(--mat-sys-headline-medium);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
    }
    .panel {
      display: block;
      padding-block-start: var(--kora-space-6);
    }
  `,
})
export class ProjectWorkspace {
  /** Route parameter. */
  readonly projectId = input.required<string>();

  protected readonly store = inject(ProjectStore);

  constructor() {
    // A signal, not a value read in an effect: the store would otherwise track its own state.
    this.store.load(this.projectId);
  }
}
