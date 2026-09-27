import { DestroyRef, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Focuses the page's `<h1 tabindex="-1">`, or the main region if the page has none. */
export function focusMainHeading(main: HTMLElement): void {
  (main.querySelector<HTMLElement>('h1[tabindex]') ?? main).focus();
}

/** Path of a URL without query and fragment: `/projects?page=2#x` → `/projects`. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * After every navigation to another page (not the first page load), runs `onNavigated` (by
 * default: focus the new page's heading once it has rendered). Moving focus tells keyboard and
 * screen-reader users that the content changed and where they are. Call from a layout component's
 * constructor.
 *
 * Focus stays put when only the query changed (filters, sorting and paging live in the URL, and
 * typing in a search box must not lose focus) and when the navigation started from inside an
 * element marked `data-keep-focus` (tab bars: the user stays on the tab they picked).
 */
export function focusHeadingOnNavigation(main: () => HTMLElement, onNavigated?: () => void): void {
  const injector = inject(Injector);
  const router = inject(Router);
  // Only the app's very first page load keeps the browser's default focus. A layout created later
  // (the shell appearing after sign-in) must handle the navigation that created it.
  let firstLoad = !router.navigated;
  let previousPath = firstLoad ? null : pathOf(router.url);
  router.events
    .pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef)),
    )
    .subscribe((event) => {
      const path = pathOf(event.urlAfterRedirects);
      const samePage = path === previousPath;
      previousPath = path;
      const keepFocus = document.activeElement?.closest('[data-keep-focus]');
      if (firstLoad || samePage || keepFocus) {
        firstLoad = false;
        return;
      }
      if (onNavigated) {
        onNavigated();
      } else {
        afterNextRender(() => focusMainHeading(main()), { injector });
      }
    });
}
