import {
  Component,
  ElementRef,
  Injector,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { ChangeControlSettings } from '../../../core/api/api.models';
import { ChangeRequestsApi } from '../../../core/api/change-requests.api';
import { ErrorMessages } from '../../../core/errors/error-messages';
import { Notifier } from '../../../core/notify/notifier';
import { FieldError, I18N_ERROR } from '../../../shared/forms/field-error';
import { submitWithApi } from '../../../shared/forms/form-helpers';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';

interface ThresholdForm {
  pmoCostPercent: string;
  pmoScheduleDays: string;
  sponsorCostPercent: string;
}

const toForm = (settings: ChangeControlSettings | undefined): ThresholdForm => ({
  pmoCostPercent: settings ? String(settings.pmoCostPercent) : '',
  pmoScheduleDays: settings ? String(settings.pmoScheduleDays) : '',
  sponsorCostPercent: settings ? String(settings.sponsorCostPercent) : '',
});

const percent = (text: string) => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100
    ? undefined
    : { kind: I18N_ERROR, message: 'admin.changeControl.errors.percent' };
};

/**
 * Change-control thresholds (feature 14): above which cost or schedule change the PMO approves,
 * and above which cost change the sponsor does. Requests submitted afterwards use them; submitted
 * ones keep their chain. Saved with If-Match; a 412 offers the other person's version.
 */
@Component({
  selector: 'kora-change-control-page',
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
    MatSuffix,
    TranslocoPipe,
  ],
  template: `
    <h2 class="visually-hidden">{{ 'admin.tabs.changeControl' | transloco }}</h2>
    @if (settings.isLoading() && !settings.hasValue()) {
      <kora-loading-state />
    } @else if (settings.error()) {
      <kora-error-state (retry)="settings.reload()" />
    } @else if (settings.hasValue()) {
      <div class="settings">
        <p class="kora-muted">{{ 'admin.changeControl.intro' | transloco }}</p>
        @if (stale()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="warning" aria-hidden="true" />
            <p>{{ 'admin.changeControl.stale' | transloco }}</p>
          </div>
          <button mat-stroked-button type="button" class="reload" (click)="reloadLatest()">
            <mat-icon svgIcon="refresh" aria-hidden="true" />
            {{ 'admin.organization.reload' | transloco }}
          </button>
        }
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <form class="kora-form" novalidate (submit)="save($event)">
          <mat-form-field>
            <mat-label>{{ 'admin.changeControl.pmoCost' | transloco }}</mat-label>
            <input matInput inputmode="decimal" [formField]="form.pmoCostPercent" />
            <span matTextSuffix>%</span>
            <mat-hint>{{ 'admin.changeControl.pmoCostHint' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.pmoCostPercent" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.changeControl.pmoDays' | transloco }}</mat-label>
            <input matInput inputmode="numeric" [formField]="form.pmoScheduleDays" />
            <span matTextSuffix>{{ 'schedule.daysSuffix' | transloco }}</span>
            <mat-hint>{{ 'admin.changeControl.pmoDaysHint' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.pmoScheduleDays" /></mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.changeControl.sponsorCost' | transloco }}</mat-label>
            <input matInput inputmode="decimal" [formField]="form.sponsorCostPercent" />
            <span matTextSuffix>%</span>
            <mat-hint>{{ 'admin.changeControl.sponsorCostHint' | transloco }}</mat-hint>
            <mat-error><kora-field-error [field]="form.sponsorCostPercent" /></mat-error>
          </mat-form-field>
          <p class="kora-muted">{{ 'admin.changeControl.always' | transloco }}</p>
          <div class="kora-form-actions">
            <span></span>
            <button
              mat-flat-button
              type="submit"
              [disabled]="form().submitting() || !form().dirty() || stale()"
            >
              {{ 'admin.changeControl.save' | transloco }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: `
    .settings {
      max-inline-size: 560px;
    }
    .reload {
      margin-block-end: var(--kora-space-4);
    }
  `,
})
export class ChangeControlPage {
  private readonly api = inject(ChangeRequestsApi);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = resource({ loader: () => firstValueFrom(this.api.settings()) });
  protected readonly model = linkedSignal<ThresholdForm>(() => toForm(this.settings.value()));
  protected readonly form = form(this.model, (path) => {
    validate(path.pmoCostPercent, ({ value }) => percent(value()));
    validate(path.sponsorCostPercent, ({ value }) => percent(value()));
    validate(path.pmoScheduleDays, ({ value }) => {
      const days = Number(value().trim());
      return value().trim() !== '' && Number.isInteger(days) && days >= 0 && days <= 1000
        ? undefined
        : { kind: I18N_ERROR, message: 'admin.changeControl.errors.days' };
    });
  });
  protected readonly stale = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const current = this.settings.value();
    if (!current) return;
    const m = this.model();
    const saved = await submitWithApi(
      this.form,
      this.context,
      async () => {
        const updated = await firstValueFrom(
          this.api.updateSettings(
            {
              pmoCostPercent: Number(m.pmoCostPercent.replace(',', '.')),
              pmoScheduleDays: Number(m.pmoScheduleDays),
              sponsorCostPercent: Number(m.sponsorCostPercent.replace(',', '.')),
            },
            current.version,
          ),
        );
        this.settings.set(updated);
        this.form().reset();
      },
      (error: ApiError) => {
        if (error.status !== 412) return false;
        this.stale.set(true);
        return true;
      },
    );
    if (saved) this.notifier.success(this.transloco.translate('admin.changeControl.saved'));
  }

  protected reloadLatest(): void {
    this.stale.set(false);
    this.formError.set(null);
    this.settings.reload();
  }
}
