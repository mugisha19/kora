import { Component, ElementRef, Injector, inject, input, signal } from '@angular/core';
import { FormField, form, maxLength, minLength, required, validate } from '@angular/forms/signals';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiError } from '../../core/api/api-error';
import { ErrorMessages } from '../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { PasswordToggle } from '../../shared/forms/password-toggle';
import { AuthFacade } from './auth.facade';

type State = 'form' | 'done' | 'invalid-link';

/**
 * Set a new password from the emailed link (`/reset-password?token=…`). An expired or used link
 * offers a new one instead of a dead end; success signs the user out everywhere (API), so the page
 * sends them to sign in.
 */
@Component({
  selector: 'kora-reset-password-page',
  imports: [
    FieldError,
    FormField,
    MatAnchor,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatSuffix,
    PasswordToggle,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './reset-password-page.html',
  styleUrl: './auth-pages.scss',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthFacade);

  /** From the emailed link's query string. */
  readonly token = input<string>();

  protected readonly state = signal<State>('form');
  protected readonly showPassword = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({ newPassword: '', confirmPassword: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.newPassword);
    minLength(path.newPassword, 12);
    maxLength(path.newPassword, 128);
    required(path.confirmPassword);
    validate(path.confirmPassword, ({ value, valueOf }) =>
      value() && value() !== valueOf(path.newPassword)
        ? { kind: I18N_ERROR, message: 'auth.reset.mismatch' }
        : undefined,
    );
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async reset(event: Event): Promise<void> {
    event.preventDefault();
    const token = this.token() ?? '';
    const done = await submitWithApi(
      this.form,
      this.context,
      () => this.auth.resetPassword(token, this.model().newPassword),
      (error: ApiError) => {
        if (error.code !== 'auth.reset_token_invalid') return false;
        this.state.set('invalid-link');
        return true;
      },
    );
    if (done) this.state.set('done');
  }
}
