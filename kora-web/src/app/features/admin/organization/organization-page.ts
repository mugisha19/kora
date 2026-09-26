import {
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { FormField, form, maxLength, minLength, pattern, required } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { UpdateOrganizationRequest } from '../../../core/api/api.models';
import { OrganizationApi } from '../../../core/api/organization.api';
import { ErrorMessages } from '../../../core/errors/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { Notifier } from '../../../core/notify/notifier';
import { SessionFacade } from '../../../core/session/session.facade';
import { FieldError } from '../../../shared/forms/field-error';
import { submitWithApi } from '../../../shared/forms/form-helpers';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';

interface OrganizationForm {
  name: string;
  currency: string;
  timeZone: string;
}

/** Options for a select, always including the current value even if this browser doesn't list it. */
function withCurrent(values: readonly string[], current: string): string[] {
  return current && !values.includes(current) ? [current, ...values] : [...values];
}

/**
 * Organization settings (feature 02): name, currency, time zone. Saved with optimistic locking:
 * if someone else saved first (412), the page says so and offers to reload their version.
 */
@Component({
  selector: 'kora-organization-page',
  imports: [
    ErrorState,
    FieldError,
    FormField,
    LoadingState,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    TranslocoPipe,
  ],
  templateUrl: './organization-page.html',
  styles: `
    .settings {
      max-inline-size: 560px;
    }
    .slug {
      margin: 0 0 var(--kora-space-4);
    }
    .reload {
      margin-block-end: var(--kora-space-4);
    }
  `,
})
export class OrganizationPage {
  private readonly api = inject(OrganizationApi);
  private readonly session = inject(SessionFacade);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  protected readonly organization = resource({
    loader: () => firstValueFrom(this.api.get()),
  });

  protected readonly model = linkedSignal<OrganizationForm>(() => {
    const organization = this.organization.value();
    return {
      name: organization?.name ?? '',
      currency: organization?.currency ?? '',
      timeZone: organization?.timeZone ?? '',
    };
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    minLength(path.name, 2);
    maxLength(path.name, 100);
    required(path.currency);
    pattern(path.currency, /^[A-Z]{3}$/);
    required(path.timeZone);
  });

  protected readonly stale = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly currencies = computed(() => {
    const names = new Intl.DisplayNames([this.language.current()], { type: 'currency' });
    return withCurrent(Intl.supportedValuesOf('currency'), this.model().currency).map((code) => ({
      code,
      label: `${code} — ${names.of(code) ?? code}`,
    }));
  });
  protected readonly timeZones = computed(() =>
    withCurrent(Intl.supportedValuesOf('timeZone'), this.model().timeZone),
  );

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const current = this.organization.value();
    if (!current) return;
    const changes = this.changedFields(current);
    if (Object.keys(changes).length === 0) return;

    const saved = await submitWithApi(
      this.form,
      this.context,
      async () => {
        const updated = await firstValueFrom(this.api.update(changes, current.version));
        this.organization.set(updated);
        this.form().reset();
        // The name appears in the organization switcher, which reads /me.
        await this.session.refreshUser();
      },
      (error: ApiError) => {
        if (error.status !== 412) return false;
        this.stale.set(true);
        return true;
      },
    );
    if (saved) this.notifier.success(this.transloco.translate('admin.organization.saved'));
  }

  protected reloadLatest(): void {
    this.stale.set(false);
    this.formError.set(null);
    this.organization.reload();
  }

  /** Only what changed, since PATCH semantics are "fields present are changed". */
  private changedFields(current: OrganizationForm): UpdateOrganizationRequest {
    const next = this.model();
    const changes: UpdateOrganizationRequest = {};
    if (next.name.trim() !== current.name) changes.name = next.name.trim();
    if (next.currency !== current.currency) changes.currency = next.currency;
    if (next.timeZone !== current.timeZone) changes.timeZone = next.timeZone;
    return changes;
  }
}
