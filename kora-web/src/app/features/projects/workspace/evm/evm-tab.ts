import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import {
  EAC_METHODS,
  EacMethod,
  EvmReport,
  Money,
  PERCENT_COMPLETE_METHODS,
  PercentCompleteMethod,
} from '../../../../core/api/api.models';
import { EvmApi } from '../../../../core/api/evm.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { LanguageService } from '../../../../core/i18n/language.service';
import { Notifier } from '../../../../core/notify/notifier';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { MoneyPipe, formatMoney } from '../../../../shared/format/money';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import { IndexGauge, SCurveChart } from './evm-charts';
import { ExportMenu } from '../../../reports/export-menu';

type MoneyMetric = 'bac' | 'pv' | 'ev' | 'ac' | 'sv' | 'cv' | 'eac' | 'etc' | 'vac';

/**
 * Earned value tab (feature 17): the metrics as of today with what each means in plain words, the
 * SPI and CPI gauges, the S-curve with BAC and EAC, and the project's methods (managers choose).
 * Figures the API can't compute (a division by zero) show "—" with its reason.
 */
@Component({
  selector: 'kora-evm-tab',
  imports: [
    ExportMenu,
    EmptyState,
    ErrorState,
    IndexGauge,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatFormField,
    MatHint,
    MatIcon,
    MatLabel,
    MatOption,
    MatSelect,
    MatSelectTrigger,
    MoneyPipe,
    SCurveChart,
    TranslocoPipe,
  ],
  templateUrl: './evm-tab.html',
  styleUrl: './evm-tab.scss',
})
export class EvmTab {
  protected readonly project = inject(ProjectStore);
  protected readonly language = inject(LanguageService);
  private readonly api = inject(EvmApi);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);

  protected readonly percentMethods = PERCENT_COMPLETE_METHODS;
  protected readonly eacMethods = EAC_METHODS;
  private readonly version = signal(0);
  protected readonly projectId = computed(() => this.project.projectId() ?? '');

  protected readonly report = resource({
    params: () => ({ id: this.projectId(), version: this.version() }),
    loader: ({ params }) => firstValueFrom(this.api.report(params.id)),
  });
  protected readonly series = resource({
    params: () => ({ id: this.projectId(), version: this.version() }),
    loader: ({ params }) => firstValueFrom(this.api.series(params.id)),
  });
  protected readonly settings = resource({
    params: () => ({ id: this.projectId(), version: this.version() }),
    loader: ({ params }) => firstValueFrom(this.api.settings(params.id)),
  });

  protected readonly choice = linkedSignal(() => {
    const s = this.settings.value();
    return {
      percentCompleteMethod: (s?.percentCompleteMethod ?? 'PHYSICAL') as PercentCompleteMethod,
      eacMethod: (s?.eacMethod ?? 'TYPICAL') as EacMethod,
    };
  });
  protected readonly changed = computed(() => {
    const s = this.settings.value();
    const c = this.choice();
    return (
      !!s && (s.percentCompleteMethod !== c.percentCompleteMethod || s.eacMethod !== c.eacMethod)
    );
  });
  protected readonly saving = signal(false);
  protected readonly settingsError = signal<string | null>(null);

  /** Why a metric is missing, by metric. */
  protected readonly missing = computed(() => {
    const map = new Map<string, string>();
    for (const u of this.report.value()?.unavailable ?? []) map.set(u.metric, u.reason);
    return map;
  });

  protected readonly moneyCards: readonly MoneyMetric[] = [
    'bac',
    'pv',
    'ev',
    'ac',
    'sv',
    'cv',
    'eac',
    'etc',
    'vac',
  ];

  protected value(report: EvmReport, metric: MoneyMetric): Money | undefined {
    return report[metric];
  }

  /** The metric in a sentence, e.g. "Over budget by RWF 1,200,000". */
  protected hint(report: EvmReport, metric: MoneyMetric): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const amount = report[metric];
    const text = (money: Money) =>
      formatMoney({ ...money, amount: money.amount.replace('-', '') }, this.language.current());
    const sign = (money: Money) =>
      money.amount.startsWith('-') ? 'negative' : Number(money.amount) === 0 ? 'zero' : 'positive';
    if (!amount) return '';
    switch (metric) {
      case 'sv':
      case 'cv':
      case 'vac':
        return t(`evm.metrics.${metric}.${sign(amount)}`, { amount: text(amount) });
      case 'eac':
        return t('evm.metrics.eac.hint', { method: t(`eacMethod.${report.eacMethod}.name`) });
      default:
        return t(`evm.metrics.${metric}.hint`);
    }
  }

  /** Negative SV, CV or VAC is bad news: shown with an icon and in words, not colour alone. */
  protected isBad(report: EvmReport, metric: MoneyMetric): boolean {
    return ['sv', 'cv', 'vac'].includes(metric) && !!report[metric]?.amount.startsWith('-');
  }

  protected currencyOne(report: EvmReport): string {
    return formatMoney(
      { amount: '1', currency: report.bac?.currency ?? 'RWF' },
      this.language.current(),
    );
  }

  protected choose(field: 'percentCompleteMethod' | 'eacMethod', value: string): void {
    this.choice.update((c) => ({ ...c, [field]: value }));
  }

  protected async saveSettings(): Promise<void> {
    const current = this.settings.value();
    if (!current) return;
    this.saving.set(true);
    this.settingsError.set(null);
    try {
      await firstValueFrom(
        this.api.updateSettings(this.projectId(), this.choice(), current.version),
      );
      this.version.update((v) => v + 1);
      this.notifier.success(this.transloco.translate('evm.settings.saved'));
    } catch (error: unknown) {
      const apiError = toApiError(error);
      this.settingsError.set(
        apiError.status === 412
          ? this.transloco.translate('evm.settings.stale')
          : this.messages.message(apiError),
      );
      if (apiError.status === 412) this.settings.reload();
    } finally {
      this.saving.set(false);
    }
  }
}
