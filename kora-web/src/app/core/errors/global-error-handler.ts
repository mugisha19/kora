import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { isApiError } from '../api/api-error';
import { Notifier } from '../notify/notifier';
import { NOW } from '../session/clock';

/** At most one "unexpected error" toast per window, so a failing loop can't flood the screen. */
const TOAST_INTERVAL_MS = 5000;

/**
 * Last line of defence for errors nothing else handled (a bug in a component, a rejected promise).
 * Logs the error for developers and tells the user something went wrong, once. HTTP errors are
 * skipped: the error interceptor or the screen that made the request has already reported them.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly now = inject(NOW);
  private lastToastAt = -Infinity;

  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof HttpErrorResponse || isApiError(error)) return;

    const now = this.now();
    if (now - this.lastToastAt < TOAST_INTERVAL_MS) return;
    this.lastToastAt = now;
    this.notifier.error(this.transloco.translate('errors.unexpected'));
  }
}
