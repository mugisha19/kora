import { ElementRef, Injector, WritableSignal, afterNextRender } from '@angular/core';
import { FieldTree, submit } from '@angular/forms/signals';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ErrorMessages } from '../../core/errors/error-messages';
import { serverErrors } from '../../core/errors/server-errors';

/**
 * Controls inside a Material form field in error state. Not `[aria-invalid]`: Material leaves that
 * off empty required inputs, which are exactly the ones a failed submit most often points at.
 */
const INVALID_CONTROL =
  '.mat-form-field-invalid :is(input, textarea, .mat-mdc-select), [aria-invalid="true"]';

/**
 * After a submit fails, move focus to the first invalid field so keyboard and screen-reader users
 * land on the problem (WCAG 3.3.1). Fields show their error state on the render after the form is
 * marked as touched, hence `afterNextRender`.
 */
export function focusFirstInvalid(host: ElementRef<HTMLElement>, injector: Injector): void {
  afterNextRender(() => host.nativeElement.querySelector<HTMLElement>(INVALID_CONTROL)?.focus(), {
    injector,
  });
}

export interface ApiFormContext {
  readonly messages: ErrorMessages;
  /** Form-level message shown above the form in a `role="alert"` region. */
  readonly formError: WritableSignal<string | null>;
  readonly host: ElementRef<HTMLElement>;
  readonly injector: Injector;
}

/**
 * Submits a Signal Form whose action calls the API:
 * - client validation first (`submit()` marks every field touched and skips the action if invalid);
 * - API field errors land on the fields they name;
 * - anything else (wrong password, rate limit, conflicts without a field) becomes `formError`,
 *   unless `handle` takes care of it (e.g. a 412 that needs a reload button);
 * - on failure, focus moves to the first invalid field.
 * Resolves `true` when the action succeeded.
 */
export async function submitWithApi<T>(
  form: FieldTree<T>,
  context: ApiFormContext,
  action: () => Promise<unknown>,
  handle?: (error: ApiError) => boolean,
): Promise<boolean> {
  context.formError.set(null);
  let succeeded = false;
  await submit(form, async () => {
    try {
      await action();
      succeeded = true;
      return undefined;
    } catch (error: unknown) {
      const apiError = toApiError(error);
      if (handle?.(apiError)) return undefined;
      const errors = serverErrors(form, apiError, (e) => context.messages.fieldMessage(e));
      const onFields = errors.filter((e) => e.fieldTree);
      const elsewhere = errors.filter((e) => !e.fieldTree).map((e) => e.message);
      if (onFields.length === 0 || elsewhere.length > 0) {
        context.formError.set(
          elsewhere.length ? elsewhere.join(' ') : context.messages.message(apiError),
        );
      }
      return onFields;
    }
  });
  if (!succeeded) focusFirstInvalid(context.host, context.injector);
  return succeeded;
}
