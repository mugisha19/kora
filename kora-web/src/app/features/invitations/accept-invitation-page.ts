import {
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { FormField, form, maxLength, minLength, required } from '@angular/forms/signals';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { InvitationsApi } from '../../core/api/invitations.api';
import { ErrorMessages } from '../../core/errors/error-messages';
import { LanguageService } from '../../core/i18n/language.service';
import { Notifier } from '../../core/notify/notifier';
import { SessionFacade } from '../../core/session/session.facade';
import { FieldError } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { LocalizedDatePipe } from '../../shared/forms/localized-date.pipe';
import { PasswordToggle } from '../../shared/forms/password-toggle';
import { LoadingState } from '../../shared/ui/loading-state';

/**
 * Invitation link `/invitations/:token` (feature 03). Public: the preview says who invited whom to
 * what. A new person creates an account (name + new password); someone who already has a Kora
 * account confirms with their current password. The link alone never signs anyone in.
 */
@Component({
  selector: 'kora-accept-invitation-page',
  imports: [
    FieldError,
    FormField,
    LoadingState,
    LocalizedDatePipe,
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
  templateUrl: './accept-invitation-page.html',
  styleUrl: './accept-invitation-page.scss',
})
export class AcceptInvitationPage {
  private readonly api = inject(InvitationsApi);
  private readonly session = inject(SessionFacade);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly messages = inject(ErrorMessages);
  protected readonly language = inject(LanguageService);

  /** Route parameter. */
  readonly token = input.required<string>();

  protected readonly preview = resource({
    params: () => this.token(),
    loader: ({ params }) => firstValueFrom(this.api.preview(params)),
  });

  /** Translated reason the link can't be used (not found, expired, revoked, already used…). */
  protected readonly unusable = computed(() => {
    const error = this.preview.error();
    return error ? this.messages.message(toApiError(error)) : null;
  });

  protected readonly existingAccount = computed(
    () => this.preview.value()?.existingAccount ?? false,
  );
  protected readonly showPassword = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({ fullName: '', password: '' });
  protected readonly form = form(this.model, (path) => {
    // A new account needs a name and a new password; an existing one only its current password.
    required(path.fullName, { when: () => !this.existingAccount() });
    maxLength(path.fullName, 120);
    required(path.password);
    minLength(path.password, () => (this.existingAccount() ? undefined : 12));
    maxLength(path.password, 128);
  });

  private readonly context = {
    messages: this.messages,
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected accept(event: Event): Promise<boolean> {
    event.preventDefault();
    const preview = this.preview.value();
    if (!preview) return Promise.resolve(false);
    const { fullName, password } = this.model();
    const body = this.existingAccount() ? { password } : { fullName: fullName.trim(), password };

    return submitWithApi(this.form, this.context, async () => {
      const session = await firstValueFrom(this.api.accept(this.token(), body));
      // Open the organization the person just joined.
      const joined = session.user.memberships.find(
        (m) => m.organizationName === preview.organizationName,
      );
      await this.session.begin(session, { organizationId: joined?.organizationId });
      // The user's saved language may just have been applied; wait for its file before translating.
      const message = await firstValueFrom(
        this.transloco.selectTranslate<string>('invitation.joined', {
          organization: preview.organizationName,
        }),
      );
      this.notifier.success(message);
    });
  }
}
