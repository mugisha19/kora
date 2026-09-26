import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ApiError, ApiFieldError } from '../api/api-error';

type HashMap = Record<string, unknown>;

/**
 * Turns API errors into translated sentences. The contract says: translate by `code` (and
 * `params`), never show `detail`/`message` (English developer text), and fall back to a generic
 * message for codes this build doesn't know yet.
 *
 * Lookup order for a whole error: `errors.codes.<code>` → `errors.status.<status>` → `errors.generic`.
 * For a field error: `errors.fields.<code>[_variant]` → `errors.codes.<code>` → `errors.fields.invalid`.
 */
@Injectable({ providedIn: 'root' })
export class ErrorMessages {
  private readonly transloco = inject(TranslocoService);

  message(error: ApiError): string {
    const params = { seconds: error.retryAfter ?? 60 };
    return (
      this.find(`errors.codes.${error.code}`, params) ??
      this.find(`errors.status.${error.status}`, params) ??
      this.transloco.translate('errors.generic')
    );
  }

  fieldMessage(error: ApiFieldError): string {
    const params = this.fieldParams(error.params);
    return (
      this.find(`errors.fields.${error.code}${this.variant(params)}`, params) ??
      this.find(`errors.codes.${error.code}`, params) ??
      this.transloco.translate('errors.fields.invalid')
    );
  }

  /** `length`/`range` with only a min or only a max, and `invalid` with a list of allowed values. */
  private variant(params: HashMap): string {
    const hasMin = params['min'] !== undefined;
    const hasMax = params['max'] !== undefined;
    if (params['allowed'] !== undefined) return '_allowed';
    if (hasMin && !hasMax) return '_min';
    if (hasMax && !hasMin) return '_max';
    return '';
  }

  private fieldParams(params: Record<string, unknown> | undefined): HashMap {
    const result: HashMap = { ...params };
    if (Array.isArray(result['allowed'])) {
      result['allowed'] = result['allowed'].join(', ');
    }
    return result;
  }

  /** The translation, or undefined when the key exists in neither the active language nor English. */
  private find(key: string, params: HashMap): string | undefined {
    const lang = this.transloco.getActiveLang();
    const known = (l: string) => key in this.transloco.getTranslation(l);
    return known(lang) || known('en') ? this.transloco.translate(key, params) : undefined;
  }
}
