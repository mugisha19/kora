import { ComponentType } from '@angular/cdk/portal';
import { DestroyRef, Injector, Signal, effect, inject, untracked } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { sideSheet } from './governance-look';

/**
 * A side sheet that belongs to a URL (`/risks/<id>`, `/issues/<id>`): opens when the route does,
 * swaps when the id changes, and goes back to the parent list (keeping its filters) when the user
 * closes it. Leaving the route another way closes the sheet. Call from a route component's
 * constructor.
 */
export function routeSheet<C, D>(
  component: ComponentType<C>,
  id: Signal<string>,
  data: (id: string) => D,
) {
  const dialog = inject(MatDialog);
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const injector = inject(Injector);
  let ref: MatDialogRef<C> | null = null;
  let leaving = false;

  const show = (current: string) => {
    ref?.close();
    const opened = dialog.open<C, D>(component, sideSheet(data(current), injector));
    ref = opened;
    opened.afterClosed().subscribe(() => {
      if (ref !== opened || leaving) return;
      ref = null;
      void router.navigate(['..'], { relativeTo: route, queryParamsHandling: 'preserve' });
    });
  };

  effect(() => {
    const current = id();
    untracked(() => show(current));
  });
  inject(DestroyRef).onDestroy(() => {
    leaving = true;
    ref?.close();
  });
}
