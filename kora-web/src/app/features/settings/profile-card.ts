import { Component, ElementRef, Injector, inject, linkedSignal, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { LOCALES, Locale } from '../../core/api/api.models';
import { MeApi } from '../../core/api/me.api';
import { ErrorMessages } from '../../core/errors/error-messages';
import { LANGUAGE_NAMES, LanguageService } from '../../core/i18n/language.service';
import { Notifier } from '../../core/notify/notifier';
import { SessionStore } from '../../core/session/session.store';
import { FieldError } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';

/**
 * Profile (feature 23): name and preferred language, saved to the account so they follow the user
 * to every device. Saving a language also switches this device to it.
 */
@Component({
  selector: 'kora-profile-card',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatError,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <h2 mat-card-title>{{ 'settings.profile.title' | transloco }}</h2>
        <mat-card-subtitle>{{ 'settings.profile.description' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <form class="kora-form" novalidate (submit)="save($event)">
          <p class="email kora-muted">{{ store.user()?.email }}</p>
          <mat-form-field>
            <mat-label>{{ 'auth.fullName' | transloco }}</mat-label>
            <input matInput autocomplete="name" [formField]="form.fullName" />
            <mat-error><kora-field-error [field]="form.fullName" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'settings.profile.language' | transloco }}</mat-label>
            <mat-select [formField]="form.locale">
              @for (locale of locales; track locale) {
                <mat-option [value]="locale" [attr.lang]="locale">{{ names[locale] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div class="kora-form-actions">
            <span></span>
            <button
              mat-flat-button
              type="submit"
              [disabled]="form().submitting() || !form().dirty()"
            >
              {{ 'settings.profile.save' | transloco }}
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .email {
      margin: 0 0 var(--kora-space-2);
      overflow-wrap: anywhere;
    }
  `,
})
export class ProfileCard {
  protected readonly store = inject(SessionStore);
  private readonly api = inject(MeApi);
  private readonly language = inject(LanguageService);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);

  protected readonly locales = LOCALES;
  protected readonly names = LANGUAGE_NAMES;
  protected readonly formError = signal<string | null>(null);
  protected readonly model = linkedSignal<{ fullName: string; locale: Locale }>(() => ({
    fullName: this.store.user()?.fullName ?? '',
    locale: this.store.user()?.locale ?? 'en',
  }));
  protected readonly form = form(this.model, (path) => {
    required(path.fullName);
    maxLength(path.fullName, 120);
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const { fullName, locale } = this.model();
    const saved = await submitWithApi(this.form, this.context, async () => {
      const me = await firstValueFrom(this.api.update({ fullName: fullName.trim(), locale }));
      this.store.setUser(me);
      this.form().reset();
      this.language.choose(me.locale);
    });
    if (saved) {
      // The language may just have changed; wait for its file so the message is in that language.
      const message = await firstValueFrom(
        this.transloco.selectTranslate<string>('settings.profile.saved'),
      );
      this.notifier.success(message);
    }
  }
}
