import { Component, Pipe, PipeTransform, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChangeRequest, ChangeRequestStatus, Money } from '../../../../core/api/api.models';
import { formatMoney } from '../../../../shared/format/money';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { CHANGE_STATUS_LOOK } from '../governance-look';
import { pendingStep } from './change.facade';

/** A change request's status: icon, colour and word. */
@Component({
  selector: 'kora-change-status',
  imports: [StatusChip, TranslocoPipe],
  template: `
    <kora-status-chip
      [tone]="look().tone"
      [icon]="look().icon"
      [label]="'changeStatus.' + status() | transloco"
    />
  `,
})
export class ChangeStatusChip {
  readonly status = input.required<ChangeRequestStatus>();
  protected readonly look = computed(() => CHANGE_STATUS_LOOK[this.status()]);
}

/** "+RWF 12,000,000" / "−RWF 1,500,000": a cost change with its sign. */
export function signedMoney(money: Money | undefined, locale: string): string {
  if (!money) return '';
  const negative = money.amount.startsWith('-');
  const text = formatMoney({ ...money, amount: money.amount.replace('-', '') }, locale);
  return `${negative ? '−' : '+'}${text}`;
}

/** Who the request waits for, in words ("Grace Mukamana", "Any PMO"). */
@Component({
  selector: 'kora-waiting-for',
  imports: [TranslocoPipe],
  template: `
    @if (step(); as s) {
      @if (s.approver) {
        {{ s.approver.fullName }}
      } @else if (s.approverRole) {
        {{ 'changes.anyRole' | transloco: { role: ('roles.' + s.approverRole | transloco) } }}
      }
      <span class="level">({{ 'approvalLevel.' + s.level | transloco }})</span>
    } @else {
      —
    }
  `,
  styles: `
    .level {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class WaitingFor {
  readonly request = input.required<ChangeRequest>();
  protected readonly step = computed(() => pendingStep(this.request()));
}

/** `{{ impact.costDelta | signedMoney: language.current() }}` */
@Pipe({ name: 'signedMoney' })
export class SignedMoneyPipe implements PipeTransform {
  transform(money: Money | undefined, locale: string): string {
    return signedMoney(money, locale);
  }
}
