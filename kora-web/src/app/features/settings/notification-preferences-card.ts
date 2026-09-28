import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { NotificationPreference } from '../../core/api/api.models';
import { toApiError } from '../../core/api/api-error';
import { NotificationsApi } from '../../core/api/notifications.api';
import { ErrorMessages } from '../../core/errors/error-messages';
import { Notifier } from '../../core/notify/notifier';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';

type Channel = 'inApp' | 'email';

/**
 * Which notifications reach me, in the app and by email (feature 18). Per person across
 * organizations. Opened from the notification center at `/settings#notifications`.
 */
@Component({
  selector: 'kora-notification-preferences-card',
  imports: [
    ErrorState,
    LoadingState,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatCheckbox,
    MatIcon,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined" id="notifications">
      <mat-card-header>
        <h2 mat-card-title tabindex="-1">
          {{ 'settings.notifications.title' | transloco }}
        </h2>
        <mat-card-subtitle>{{
          'settings.notifications.description' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (preferences.error()) {
          <kora-error-state (retry)="preferences.reload()" />
        } @else if (preferences.hasValue()) {
          @if (formError()) {
            <div class="kora-notice error" role="alert">
              <mat-icon svgIcon="error" aria-hidden="true" />
              <p>{{ formError() }}</p>
            </div>
          }
          <div class="wrap">
            <table>
              <caption class="visually-hidden">
                {{
                  'settings.notifications.title' | transloco
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ 'settings.notifications.kind' | transloco }}</th>
                  <th scope="col">{{ 'settings.notifications.inApp' | transloco }}</th>
                  <th scope="col">{{ 'settings.notifications.email' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (p of draft(); track p.type) {
                  <tr>
                    <th scope="row">
                      {{ 'notificationType.' + p.type + '.name' | transloco }}
                      <span class="hint">{{
                        'notificationType.' + p.type + '.hint' | transloco
                      }}</span>
                    </th>
                    @for (channel of channels; track channel) {
                      <td>
                        <mat-checkbox
                          [checked]="p[channel]"
                          [aria-label]="label(p, channel)"
                          (change)="set(p, channel, $event.checked)"
                        />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="actions">
            <button
              mat-flat-button
              type="button"
              [disabled]="!changed() || saving()"
              (click)="save()"
            >
              {{ 'settings.notifications.save' | transloco }}
            </button>
          </div>
        } @else {
          <kora-loading-state />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .wrap {
      overflow-x: auto;
    }
    table {
      inline-size: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
      vertical-align: middle;
    }
    thead th {
      font: var(--mat-sys-label-large);
    }
    thead th:not(:first-child),
    td {
      inline-size: 7rem;
      text-align: center;
    }
    tbody th {
      font: var(--mat-sys-body-medium);
    }
    .hint {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-block-start: var(--kora-space-3);
    }
  `,
})
export class NotificationPreferencesCard {
  private readonly api = inject(NotificationsApi);
  private readonly messages = inject(ErrorMessages);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fragment = toSignal(inject(ActivatedRoute).fragment);

  protected readonly channels: readonly Channel[] = ['inApp', 'email'];
  protected readonly preferences = resource({
    loader: () => firstValueFrom(this.api.preferences()),
  });
  protected readonly draft = linkedSignal<NotificationPreference[]>(() =>
    this.preferences.hasValue() ? this.preferences.value().preferences : [],
  );
  protected readonly changed = computed(() => this.changes().length > 0);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly changes = computed(() => {
    const saved = this.preferences.hasValue() ? this.preferences.value().preferences : [];
    return this.draft().filter((p) => {
      const before = saved.find((s) => s.type === p.type);
      return !before || before.inApp !== p.inApp || before.email !== p.email;
    });
  });

  constructor() {
    const injector = inject(Injector);
    // Linked from the notification center: bring this card into view.
    afterNextRender(
      () => {
        if (this.fragment() !== 'notifications') return;
        const host = this.host.nativeElement;
        host.scrollIntoView({ block: 'start' });
        host.querySelector<HTMLElement>('[mat-card-title]')?.focus();
      },
      { injector },
    );
  }

  protected label(p: NotificationPreference, channel: Channel): string {
    return this.transloco.translate(`settings.notifications.${channel}For`, {
      kind: this.transloco.translate(`notificationType.${p.type}.name`),
    });
  }

  protected set(p: NotificationPreference, channel: Channel, value: boolean): void {
    this.draft.update((list) =>
      list.map((item) => (item.type === p.type ? { ...item, [channel]: value } : item)),
    );
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.formError.set(null);
    try {
      const saved = await firstValueFrom(this.api.updatePreferences(this.changes()));
      this.preferences.set(saved);
      this.notifier.success(this.transloco.translate('settings.notifications.saved'));
    } catch (error: unknown) {
      this.formError.set(this.messages.message(toApiError(error)));
    } finally {
      this.saving.set(false);
    }
  }
}
