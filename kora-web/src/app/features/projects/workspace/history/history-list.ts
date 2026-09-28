import { Component, computed, inject, input, resource } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuditEvent } from '../../../../core/api/api.models';
import { AuditApi } from '../../../../core/api/audit.api';
import { toApiError } from '../../../../core/api/api-error';
import { ChangeFormat } from '../../../../core/audit/change-format';
import { LanguageService } from '../../../../core/i18n/language.service';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';

/**
 * An item's history (feature 19): who changed what and when, newest first, each field with its
 * value before and after. Used by the task, risk, issue, change request and project views.
 */
@Component({
  selector: 'kora-history-list',
  imports: [ErrorState, LoadingState, TranslocoPipe],
  template: `
    @if (events.error(); as error) {
      @if (notFound()) {
        <p class="kora-muted">{{ 'history.empty' | transloco }}</p>
      } @else {
        <kora-error-state (retry)="events.reload()" />
      }
    } @else if (events.hasValue()) {
      @if (entries().length) {
        <ol class="history">
          @for (e of entries(); track e.id) {
            <li>
              <p class="what">
                <strong>{{ actor(e) }}</strong>
                {{ 'history.verb.' + verb(e) | transloco }}
                <time [attr.datetime]="e.occurredAt">{{ when(e.occurredAt) }}</time>
              </p>
              @if (lines(e).length) {
                <dl>
                  @for (line of lines(e); track line.field) {
                    <div>
                      <dt>{{ line.label }}</dt>
                      <dd>
                        @if (line.before !== null) {
                          <del>
                            <span class="visually-hidden">{{ 'history.before' | transloco }}</span>
                            {{ line.before }}
                          </del>
                          <span aria-hidden="true"> → </span>
                        }
                        @if (line.after !== null) {
                          <ins>
                            <span class="visually-hidden">{{ 'history.after' | transloco }}</span>
                            {{ line.after }}
                          </ins>
                        } @else {
                          <span class="kora-muted">{{ 'history.removed' | transloco }}</span>
                        }
                      </dd>
                    </div>
                  }
                </dl>
              }
            </li>
          }
        </ol>
      } @else {
        <p class="kora-muted">{{ 'history.empty' | transloco }}</p>
      }
    } @else {
      <kora-loading-state />
    }
  `,
  styles: `
    .history {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding-block: var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    .what {
      margin: 0;
      font: var(--mat-sys-body-medium);
    }
    time {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    dl {
      display: grid;
      gap: 2px;
      margin: var(--kora-space-1) 0 0;
      font: var(--mat-sys-body-small);
    }
    dl > div {
      display: grid;
      grid-template-columns: minmax(6rem, 30%) 1fr;
      gap: var(--kora-space-2);
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    del {
      color: var(--mat-sys-on-surface-variant);
    }
    ins {
      text-decoration: none;
      font-weight: 600;
    }
  `,
})
export class HistoryList {
  /** As in audit events: task, risk, issue, change-request, project… */
  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();

  private readonly api = inject(AuditApi);
  private readonly format = inject(ChangeFormat);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly events = resource({
    params: () => ({ type: this.entityType(), id: this.entityId() }),
    loader: ({ params }) => firstValueFrom(this.api.history(params.type, params.id)),
  });
  /** Nothing recorded yet (items made before the audit trail existed): not an error. */
  protected readonly notFound = computed(() => toApiError(this.events.error()).status === 404);
  protected readonly entries = computed(() =>
    this.events.hasValue() ? [...this.events.value()].reverse() : [],
  );

  protected actor(e: AuditEvent): string {
    return e.actor?.fullName ?? this.transloco.translate('history.system');
  }

  protected verb(e: AuditEvent): string {
    return e.action.slice(e.action.lastIndexOf('.') + 1);
  }

  protected lines(e: AuditEvent) {
    return this.format.lines(e.changes);
  }

  protected when(iso: string): string {
    return new Intl.DateTimeFormat(this.language.current(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}
