import { Component, Injectable, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, map } from 'rxjs';

export interface ConfirmDialogData {
  title: string;
  message: string;
  /** Label of the confirm button; defaults to "Confirm". */
  confirmLabel?: string;
  /** Destructive actions get a red confirm button, and focus starts on Cancel. */
  destructive?: boolean;
}

@Component({
  selector: 'kora-confirm-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <!-- First in tab order: destructive dialogs open with focus here (autoFocus: first-tabbable). -->
      <button mat-button type="button" [mat-dialog-close]="false">
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        mat-flat-button
        type="button"
        [class.destructive]="data.destructive"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel ?? ('common.confirm' | transloco) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .destructive {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

/** Asks for confirmation; emits `true` only when the user explicitly confirms. */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        role: data.destructive ? 'alertdialog' : 'dialog',
        autoFocus: data.destructive ? 'first-tabbable' : 'dialog',
        maxWidth: 'min(480px, calc(100vw - 32px))',
      })
      .afterClosed()
      .pipe(map((result) => result === true));
  }
}
