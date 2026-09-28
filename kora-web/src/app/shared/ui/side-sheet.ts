import { Injector } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';

/**
 * A dialog that slides in from the right, full height — the task sheet's look. `injector` lets the
 * sheet use the opener's services (a tab's facade, the project's store).
 */
export function sideSheet<D>(data: D, injector: Injector): MatDialogConfig<D> {
  return {
    data,
    injector,
    position: { right: '0' },
    height: '100dvh',
    width: 'min(560px, 100vw)',
    maxWidth: '100vw',
    panelClass: 'kora-side-sheet',
    autoFocus: 'dialog',
  };
}
