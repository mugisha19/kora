import { Component, ElementRef, Injector, inject, signal } from '@angular/core';
import { FormField, email, form, maxLength, minLength, required } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { RegisterOrganizationRequest } from '../../core/api/api.models';
import { ErrorMessages } from '../../core/errors/error-messages';
import { FieldError } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { PasswordToggle } from '../../shared/forms/password-toggle';
import { AuthFacade } from './auth.facade';

type Registration = Required<
  Pick<RegisterOrganizationRequest, 'organizationName' | 'fullName' | 'email' | 'password'>
>;

/**
 * Create an organization and its first administrator (feature 02). Limits mirror the contract,
 * so most mistakes are caught before the request; the API's own field errors still land on the
 * right fields (e.g. `auth.email_taken`, `password.breached`).
 */
@Component({
  selector: 'kora-register-page',
  imports: [
    FieldError,
    FormField,
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
  templateUrl: './register-page.html',
  styleUrl: './auth-pages.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthFacade);

  protected readonly showPassword = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<Registration>({
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.organizationName);
    minLength(path.organizationName, 2);
    maxLength(path.organizationName, 100);
    required(path.fullName);
    maxLength(path.fullName, 120);
    required(path.email);
    email(path.email);
    required(path.password);
    minLength(path.password, 12);
    maxLength(path.password, 128);
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected register(event: Event): Promise<boolean> {
    event.preventDefault();
    return submitWithApi(this.form, this.context, () =>
      this.auth.registerOrganization({
        ...this.model(),
        organizationName: this.model().organizationName.trim(),
        fullName: this.model().fullName.trim(),
      }),
    );
  }
}
