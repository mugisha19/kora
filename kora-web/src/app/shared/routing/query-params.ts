import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

/**
 * List filters live in the URL (feature 05: "kept in the URL for sharing"). Pages read them as
 * component inputs (router `withComponentInputBinding`) and change them through this service, so a
 * reload, a shared link or the back button restores the same view.
 */
@Injectable()
export class QueryParams {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Merges `changes` into the current query. `null`, `undefined` and `''` remove a parameter.
   * Filter changes replace the history entry so Back leaves the page instead of undoing a keystroke.
   */
  set(changes: Params, { replaceUrl = true } = {}): Promise<boolean> {
    const queryParams = Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [key, value === '' ? null : value]),
    );
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}

/** Parses a non-negative integer query parameter. */
export function intParam(value: string | undefined, fallback: number, max = Infinity): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

/** A query parameter restricted to known values (anything else falls back). */
export function oneOfParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}
