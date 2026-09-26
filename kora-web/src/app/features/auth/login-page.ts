import { Component, ElementRef, Injector, inject, input, signal } from '@angular/core';
import { FormField, email, form, required } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { ErrorMessages } from '../../core/errors/error-messages';
import { FieldError } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { PasswordToggle } from '../../shared/forms/password-toggle';
import { AuthFacade } from './auth.facade';

interface Credentials {
  email: string;
  password: string;
}

/**
 * Sign-in (feature 01). One generic message for a wrong email or password, so the page never
 * reveals which emails have accounts. `returnUrl` is validated before use (open redirects).
 */
@Component({
  selector: 'kora-login-page',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatSuffix,
    PasswordToggle,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './login-page.html',
  styleUrl: './auth-pages.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthFacade);

  /** Query parameters, bound by the router. */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly demo = environment.demoLogins;
  protected readonly showPassword = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<Credentials>({ email: '', password: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.email);
    email(path.email);
    required(path.password);
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected signIn(event?: Event): Promise<boolean> {
    event?.preventDefault();
    return submitWithApi(this.form, this.context, () =>
      this.auth.signIn(this.model(), this.returnUrl() ?? null),
    );
  }

  protected signInAs(accountEmail: string): Promise<boolean> {
    this.model.set({ email: accountEmail, password: this.demo?.password ?? '' });
    return this.signIn();
  }
}
