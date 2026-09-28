import { Component, ElementRef, Injector, computed, inject, resource, signal } from '@angular/core';
import { FormField, form, required, validate } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { UserRef } from '../../core/api/api.models';
import { ResourcesApi } from '../../core/api/resources.api';
import { TimesheetsApi } from '../../core/api/timesheets.api';
import { ErrorMessages } from '../../core/errors/error-messages';
import { LanguageService } from '../../core/i18n/language.service';
import { Notifier } from '../../core/notify/notifier';
import { OrgDirectory } from '../../core/people/org-directory';
import { OrgClock } from '../../core/session/org-clock';
import { SessionStore } from '../../core/session/session.store';
import { FieldError, I18N_ERROR } from '../../shared/forms/field-error';
import { submitWithApi } from '../../shared/forms/form-helpers';
import { LocalizedDatePipe } from '../../shared/forms/localized-date.pipe';
import { MoneyPipe, parseAmount } from '../../shared/format/money';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';

export interface PersonSheetData {
  user: UserRef;
  /** Called after a change that moves the heat map. */
  changed: () => void;
}

/**
 * One person's capacity (feature 16): weekly hours and their history, leave, and — for
 * administrators and the PMO — hourly cost rates (confidential). The person records their own
 * leave; administrators and the PMO change hours and rates.
 */
@Component({
  selector: 'kora-person-sheet',
  imports: [
    ErrorState,
    FieldError,
    FormField,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSuffix,
    MoneyPipe,
    TranslocoPipe,
  ],
  templateUrl: './person-sheet.html',
  styleUrl: './person-sheet.scss',
})
export class PersonSheet {
  protected readonly data = inject<PersonSheetData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PersonSheet>);
  private readonly api = inject(ResourcesApi);
  private readonly timesheets = inject(TimesheetsApi);
  private readonly session = inject(SessionStore);
  private readonly directory = inject(OrgDirectory);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly clock = inject(OrgClock);
  protected readonly language = inject(LanguageService);

  private readonly role = computed(() => this.session.activeRole());
  protected readonly isSelf = computed(() => this.session.user()?.id === this.data.user.userId);
  /** Administrators and the PMO change hours and see rates; the person manages their leave too. */
  protected readonly keeper = computed(() => this.role() === 'ORG_ADMIN' || this.role() === 'PMO');
  protected readonly canLeave = computed(() => this.keeper() || this.isSelf());
  protected readonly currency = computed(() => this.directory.currency() ?? 'RWF');

  protected readonly capacity = resource({
    loader: () => firstValueFrom(this.api.capacity(this.data.user.userId)),
  });
  protected readonly rates = resource({
    params: () => (this.keeper() ? this.data.user.userId : undefined),
    loader: ({ params }) => firstValueFrom(this.timesheets.costRates(params)),
  });

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: signal<string | null>(null),
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected readonly hoursModel = signal({ hoursPerWeek: '', validFrom: this.clock.today() });
  protected readonly hoursForm = form(this.hoursModel, (path) => {
    required(path.validFrom);
    validate(path.hoursPerWeek, ({ value }) => {
      const hours = Number(value().replace(',', '.'));
      return value().trim() && Number.isFinite(hours) && hours >= 0 && hours <= 80
        ? undefined
        : { kind: I18N_ERROR, message: 'resources.errors.hours' };
    });
  });

  protected readonly leaveModel = signal({ from: '', to: '', reason: '' });
  protected readonly leaveForm = form(this.leaveModel, (path) => {
    required(path.from);
    required(path.to);
    validate(path.to, ({ value, valueOf }) =>
      value() && valueOf(path.from) && value() < valueOf(path.from)
        ? { kind: I18N_ERROR, message: 'resources.errors.leaveOrder' }
        : undefined,
    );
  });

  protected readonly rateModel = signal({ amount: '', validFrom: this.clock.today() });
  protected readonly rateForm = form(this.rateModel, (path) => {
    required(path.validFrom);
    validate(path.amount, ({ value }) =>
      parseAmount(value(), this.currency()) === null
        ? { kind: I18N_ERROR, message: 'errors.fields.amount' }
        : undefined,
    );
  });

  protected async changeHours(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.hoursModel();
    const ok = await submitWithApi(this.hoursForm, this.context, async () => {
      this.capacity.set(
        await firstValueFrom(
          this.api.changeCapacity(this.data.user.userId, {
            hoursPerWeek: Number(m.hoursPerWeek.replace(',', '.')),
            validFrom: m.validFrom,
          }),
        ),
      );
    });
    if (ok) this.done('resources.hoursChanged');
  }

  protected async addLeave(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.leaveModel();
    const ok = await submitWithApi(this.leaveForm, this.context, async () => {
      await firstValueFrom(
        this.api.addLeave(this.data.user.userId, {
          from: m.from,
          to: m.to,
          ...(m.reason.trim() ? { reason: m.reason.trim() } : {}),
        }),
      );
    });
    if (!ok) return;
    this.leaveModel.set({ from: '', to: '', reason: '' });
    this.leaveForm().reset();
    this.capacity.reload();
    this.done('resources.leaveAdded');
  }

  protected async cancelLeave(leaveId: string): Promise<void> {
    try {
      await firstValueFrom(this.api.cancelLeave(leaveId));
    } catch {
      return; // Toasted by the error interceptor.
    }
    this.capacity.reload();
    this.done('resources.leaveCancelled');
  }

  protected async addRate(event: Event): Promise<void> {
    event.preventDefault();
    const m = this.rateModel();
    const ok = await submitWithApi(this.rateForm, this.context, async () => {
      await firstValueFrom(
        this.timesheets.addCostRate(this.data.user.userId, {
          hourlyRate: {
            amount: parseAmount(m.amount, this.currency()) as string,
            currency: this.currency(),
          },
          validFrom: m.validFrom,
        }),
      );
    });
    if (!ok) return;
    this.rateModel.set({ amount: '', validFrom: this.clock.today() });
    this.rateForm().reset();
    this.rates.reload();
    this.notifier.success(this.transloco.translate('resources.rateAdded'));
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected formError() {
    return this.context.formError();
  }

  private done(message: string): void {
    this.data.changed();
    this.notifier.success(this.transloco.translate(message, { name: this.data.user.fullName }));
  }
}
