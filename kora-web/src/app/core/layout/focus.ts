import { DestroyRef, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, skip } from 'rxjs';

/** Focuses the page's `<h1 tabindex="-1">`, or the main region if the page has none. */
export function focusMainHeading(main: HTMLElement): void {
  (main.querySelector<HTMLElement>('h1[tabindex]') ?? main).focus();
}

/**
 * After every navigation except the first page load, runs `onNavigated` (by default: focus the new
 * page's heading once it has rendered). Moving focus tells keyboard and screen-reader users that
 * the content changed and where they are. Call from a layout component's constructor.
 */
export function focusHeadingOnNavigation(main: () => HTMLElement, onNavigated?: () => void): void {
  const injector = inject(Injector);
  const router = inject(Router);
  // Only the app's very first page load keeps the browser's default focus. A layout created later
  // (the shell appearing after sign-in) must handle the navigation that created it.
  const firstLoad = !router.navigated;
  router.events
    .pipe(
      filter((event) => event instanceof NavigationEnd),
      skip(firstLoad ? 1 : 0),
      takeUntilDestroyed(inject(DestroyRef)),
    )
    .subscribe(() => {
      if (onNavigated) {
        onNavigated();
      } else {
        afterNextRender(() => focusMainHeading(main()), { injector });
      }
    });
}
