import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ValidationError } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';

/** Anything with a Signal Forms state: `form.email`, `form.objectives[2].metric`… */
export type FieldWithErrors = () => { errors(): readonly ValidationError[] };

/**
 * Custom validators report `{ kind: 'i18n', message: '<translation key>' }`; the key is translated
 * here so the message follows the language even after the error was raised.
 */
export const I18N_ERROR = 'i18n';

/**
 * The first error of a field, translated. Built-in validators are mapped by kind; server errors
 * (`kind: 'server'`) arrive already translated by `ErrorMessages`.
 * Use inside `<mat-error>`, which only shows once the field is touched or the form submitted.
 */
@Component({
  selector: 'kora-field-error',
  template: `{{ message() }}`,
})
export class FieldError {
  readonly field = input.required<FieldWithErrors>();

  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$);

  protected readonly message = computed(() => {
    this.language();
    const error = this.field()().errors()[0];
    return error ? this.translate(error) : '';
  });

  private translate(error: ValidationError): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const details = error as ValidationError & { minLength?: number; maxLength?: number };
    switch (error.kind) {
      case 'required':
        return t('errors.fields.required');
      case 'email':
        return t('errors.fields.email');
      case 'minLength':
        return t('errors.fields.length_min', { min: details.minLength });
      case 'maxLength':
        return t('errors.fields.length_max', { max: details.maxLength });
      case 'pattern':
        return t('errors.fields.format');
      case I18N_ERROR:
        return t(error.message ?? 'errors.fields.invalid');
      default:
        return error.message ?? t('errors.fields.invalid');
    }
  }
}
