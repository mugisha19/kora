import { Component, ElementRef, Injector, inject, signal } from '@angular/core';
import { FormField, email, form, required } from '@angular/forms/signals';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorMessages } from '../../core/errors/error-messages';
import { FieldError } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { AuthFacade } from './auth.facade';

/**
 * Request a reset link. The confirmation is the same whether or not the email has an account
 * ("if an account exists…"), so the page can't be used to discover accounts.
 */
@Component({
  selector: 'kora-forgot-password-page',
  imports: [
    FieldError,
    FormField,
    MatAnchor,
    MatButton,
    MatError,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <h1 class="kora-page-title" tabindex="-1">{{ 'auth.forgot.title' | transloco }}</h1>
    @if (sentTo(); as address) {
      <div class="kora-notice success" role="status">
        <mat-icon svgIcon="mail" aria-hidden="true" />
        <p>{{ 'auth.forgot.sent' | transloco: { email: address } }}</p>
      </div>
      <a mat-stroked-button routerLink="/login">{{ 'auth.forgot.back' | transloco }}</a>
    } @else {
      <p class="kora-page-subtitle">{{ 'auth.forgot.subtitle' | transloco }}</p>
      @if (formError()) {
        <div class="kora-notice error" role="alert">
          <mat-icon svgIcon="error" aria-hidden="true" />
          <p>{{ formError() }}</p>
        </div>
      }
      <form class="kora-form" novalidate (submit)="send($event)">
        <mat-form-field>
          <mat-label>{{ 'auth.email' | transloco }}</mat-label>
          <input matInput type="email" autocomplete="email" [formField]="form.email" />
          <mat-error><kora-field-error [field]="form.email" /></mat-error>
        </mat-form-field>
        <div class="kora-form-actions">
          <a routerLink="/login">{{ 'auth.forgot.back' | transloco }}</a>
          <button mat-flat-button type="submit" [disabled]="form().submitting()">
            {{ 'auth.forgot.submit' | transloco }}
          </button>
        </div>
      </form>
    }
  `,
  styleUrl: './auth-pages.scss',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthFacade);

  protected readonly sentTo = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({ email: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.email);
    email(path.email);
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    const address = this.model().email.trim();
    if (await submitWithApi(this.form, this.context, () => this.auth.forgotPassword(address))) {
      this.sentTo.set(address);
    }
  }
}
