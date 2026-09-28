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
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { DAYS_OF_WEEK, Holiday, WorkingCalendar } from '../../../core/api/api.models';
import { ResourcesApi } from '../../../core/api/resources.api';
import { ScheduleApi } from '../../../core/api/schedule.api';
import { OrgClock } from '../../../core/session/org-clock';
import { toApiError } from '../../../core/api/api-error';
import { ErrorMessages } from '../../../core/errors/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { Notifier } from '../../../core/notify/notifier';
import { FieldError, I18N_ERROR } from '../../../shared/forms/field-error';
import { focusFirstInvalid, submitWithApi } from '../../../shared/forms/form-helpers';
import { LocalizedDatePipe } from '../../../shared/forms/localized-date.pipe';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';

interface CalendarForm {
  /** One flag per day, Monday first (`DAYS_OF_WEEK`). */
  workingDays: boolean[];
  holidays: Holiday[];
}

const byDate = (a: Holiday, b: Holiday) => a.date.localeCompare(b.date);

/**
 * The organization's working calendar (feature 10): the days of the week people work and the
 * holidays. Every Predictive and Hybrid schedule counts durations in these working days. Saved
 * with optimistic locking; a 412 offers to reload the other person's version.
 */
@Component({
  selector: 'kora-calendar-page',
  imports: [
    ErrorState,
    FieldError,
    FormField,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatCheckbox,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    TranslocoPipe,
  ],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export class CalendarPage {
  private readonly api = inject(ScheduleApi);
  private readonly resources = inject(ResourcesApi);
  private readonly clock = inject(OrgClock);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = inject(LanguageService);

  protected readonly days = DAYS_OF_WEEK;
  protected readonly calendar = resource({
    loader: () => firstValueFrom(this.api.calendar()),
  });

  protected readonly model = linkedSignal<CalendarForm>(() => this.toForm(this.calendar.value()));
  protected readonly form = form(this.model, (path) => {
    validate(path.workingDays, ({ value }) =>
      value().some(Boolean)
        ? undefined
        : { kind: I18N_ERROR, message: 'admin.calendar.errors.noDays' },
    );
  });
  protected readonly changed = computed(() => {
    const saved = this.calendar.value();
    return !!saved && JSON.stringify(this.toForm(saved)) !== JSON.stringify(this.model());
  });

  protected readonly holiday = signal({ date: '', name: '' });
  protected readonly holidayForm = form(this.holiday, (path) => {
    required(path.date);
    required(path.name);
    maxLength(path.name, 100);
    validate(path.date, ({ value }) =>
      this.model().holidays.some((h) => h.date === value())
        ? { kind: I18N_ERROR, message: 'admin.calendar.errors.duplicate' }
        : undefined,
    );
  });

  protected readonly stale = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: this.host,
    injector: this.injector,
  };

  protected toggleDay(index: number, checked: boolean): void {
    this.model.update((m) => ({
      ...m,
      workingDays: m.workingDays.map((on, i) => (i === index ? checked : on)),
    }));
  }

  protected async addHoliday(event: Event): Promise<void> {
    event.preventDefault();
    let added = false;
    await submit(this.holidayForm, async () => {
      const { date, name } = this.holiday();
      this.model.update((m) => ({
        ...m,
        holidays: [...m.holidays, { date, name: name.trim() }].sort(byDate),
      }));
      added = true;
      return undefined;
    });
    if (added) {
      this.holiday.set({ date: '', name: '' });
      this.holidayForm().reset();
    } else {
      focusFirstInvalid(this.host, this.injector);
    }
  }

  /** This year and the next: the years whose Rwandan public holidays can be added. */
  protected readonly years = computed(() => {
    const year = Number(this.clock.today().slice(0, 4));
    return [year, year + 1];
  });
  protected readonly year = linkedSignal(() => this.years()[0]);
  protected readonly adding = signal(false);

  /** Adds Rwanda's public holidays of a year (saved at once; Eid dates are added by hand). */
  protected async addPublicHolidays(): Promise<void> {
    const current = this.calendar.value();
    if (!current) return;
    this.adding.set(true);
    this.formError.set(null);
    try {
      const updated = await firstValueFrom(
        this.resources.addPublicHolidays(this.year(), current.version),
      );
      const before = current.holidays.length;
      this.calendar.set(updated);
      this.notifier.success(
        this.transloco.translate('admin.calendar.holidaysAdded', {
          count: updated.holidays.length - before,
          year: this.year(),
        }),
      );
    } catch (error: unknown) {
      const apiError = toApiError(error);
      if (apiError.status === 412) this.stale.set(true);
      else this.formError.set(this.context.messages.message(apiError));
    } finally {
      this.adding.set(false);
    }
  }

  protected removeHoliday(holiday: Holiday): void {
    this.model.update((m) => ({ ...m, holidays: m.holidays.filter((h) => h !== holiday) }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const current = this.calendar.value();
    if (!current) return;
    const m = this.model();
    const saved = await submitWithApi(
      this.form,
      this.context,
      async () => {
        const updated = await firstValueFrom(
          this.api.updateCalendar(
            {
              workingDays: this.days.filter((_, i) => m.workingDays[i]),
              holidays: m.holidays,
            },
            current.version,
          ),
        );
        this.calendar.set(updated);
      },
      (error: ApiError) => {
        if (error.status !== 412) return false;
        this.stale.set(true);
        return true;
      },
    );
    if (saved) this.notifier.success(this.transloco.translate('admin.calendar.saved'));
  }

  protected reloadLatest(): void {
    this.stale.set(false);
    this.formError.set(null);
    this.calendar.reload();
  }

  private toForm(calendar: WorkingCalendar | undefined): CalendarForm {
    return {
      workingDays: this.days.map((d) => calendar?.workingDays.includes(d) ?? false),
      holidays: [...(calendar?.holidays ?? [])].sort(byDate),
    };
  }
}
