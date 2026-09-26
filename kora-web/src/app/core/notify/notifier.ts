import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Toasts. Errors are announced assertively and stay until dismissed (WCAG 2.2.1: no time limit on
 * reading something the user needs); confirmations are polite and disappear on their own.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  error(message: string, correlationId?: string): void {
    const text = correlationId
      ? `${message} ${this.transloco.translate('errors.reference', { id: correlationId })}`
      : message;
    this.snackBar.open(text, this.transloco.translate('common.dismiss'), {
      politeness: 'assertive',
      panelClass: 'kora-snackbar-error',
    });
  }

  /** Neutral information (e.g. why a page was not opened); polite, stays a little longer. */
  info(message: string): void {
    this.snackBar.open(message, this.transloco.translate('common.dismiss'), {
      duration: 8000,
      politeness: 'polite',
    });
  }

  success(message: string): void {
    this.snackBar.open(message, this.transloco.translate('common.dismiss'), {
      duration: 5000,
      politeness: 'polite',
    });
  }
}
