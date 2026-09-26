import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, ElementRef, Injector, afterNextRender, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatListItem, MatListItemIcon, MatListItemTitle, MatNavList } from '@angular/material/list';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map, skip } from 'rxjs';
import { LoadingService } from '../http/loading.service';
import { LanguageMenu } from './language-menu';
import { NAV_ITEMS } from './nav-items';
import { ThemeMenu } from './theme-menu';

/** Below this width the navigation becomes an overlay drawer opened from the toolbar. */
export const HANDSET_QUERY = '(max-width: 959.98px)';

/**
 * Application frame: skip link, toolbar, responsive side navigation and the routed page.
 * After each navigation, focus moves to the new page's heading so keyboard and screen-reader users
 * start at the top of the new content instead of on the link they clicked.
 */
@Component({
  selector: 'kora-shell',
  imports: [
    LanguageMenu,
    MatIcon,
    MatIconButton,
    MatListItem,
    MatListItemIcon,
    MatListItemTitle,
    MatNavList,
    MatProgressBar,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatToolbar,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ThemeMenu,
    TranslocoPipe,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly injector = inject(Injector);
  private readonly sidenav = viewChild.required(MatSidenav);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly loading = inject(LoadingService);
  protected readonly navItems = NAV_ITEMS;
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(HANDSET_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        // The first page load keeps the browser's default focus (top of the document).
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const sidenav = this.sidenav();
        if (this.isHandset() && sidenav.opened) {
          // Closing the drawer restores focus to its trigger; move focus only after that happens.
          void sidenav.close().then(() => this.focusMainHeading());
        } else {
          afterNextRender(() => this.focusMainHeading(), { injector: this.injector });
        }
      });
  }

  /** Router apps can't use a bare `href="#main"` (it navigates to `/`), so the skip link focuses directly. */
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.focusMainHeading();
  }

  private focusMainHeading(): void {
    const main = this.main().nativeElement;
    (main.querySelector<HTMLElement>('h1[tabindex]') ?? main).focus();
  }
}
