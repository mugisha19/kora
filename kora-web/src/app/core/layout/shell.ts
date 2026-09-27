import { BreakpointObserver } from '@angular/cdk/layout';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatListItem, MatListItemIcon, MatListItemTitle, MatNavList } from '@angular/material/list';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { LoadingService } from '../http/loading.service';
import { SessionStore } from '../session/session.store';
import { focusHeadingOnNavigation, focusMainHeading } from './focus';
import { ApprovalsButton } from './approvals-button';
import { LanguageMenu } from './language-menu';
import { visibleNavItems } from './nav-items';
import { OrgSwitcher } from './org-switcher';
import { ThemeMenu } from './theme-menu';
import { UserMenu } from './user-menu';

/** Below this width the navigation becomes an overlay drawer opened from the toolbar. */
export const HANDSET_QUERY = '(max-width: 959.98px)';

/**
 * Frame of the signed-in app: skip link, toolbar (organization, language, theme, account),
 * responsive side navigation filtered by role, and the routed page. After each navigation, focus
 * moves to the new page's heading so keyboard and screen-reader users start at the new content.
 */
@Component({
  selector: 'kora-shell',
  imports: [
    ApprovalsButton,
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
    OrgSwitcher,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ThemeMenu,
    TranslocoPipe,
    UserMenu,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly injector = inject(Injector);
  private readonly sidenav = viewChild.required(MatSidenav);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly store = inject(SessionStore);

  protected readonly loading = inject(LoadingService);
  protected readonly navItems = computed(() => visibleNavItems(this.store.activeRole()));
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(HANDSET_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    focusHeadingOnNavigation(
      () => this.main().nativeElement,
      () => {
        const sidenav = this.sidenav();
        if (this.isHandset() && sidenav.opened) {
          // Closing the drawer restores focus to its trigger; move focus only after that happens.
          void sidenav.close().then(() => focusMainHeading(this.main().nativeElement));
        } else {
          afterNextRender(() => focusMainHeading(this.main().nativeElement), {
            injector: this.injector,
          });
        }
      },
    );
  }

  /** Router apps can't use a bare `href="#main"` (it navigates to `/`), so the skip link focuses directly. */
  protected skipToMain(event: Event): void {
    event.preventDefault();
    focusMainHeading(this.main().nativeElement);
  }
}
