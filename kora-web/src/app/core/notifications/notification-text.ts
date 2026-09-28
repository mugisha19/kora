import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppNotification } from '../api/api.models';
import { LanguageService } from '../i18n/language.service';
import { OrgDirectory } from '../people/org-directory';

/**
 * A notification as a sentence in the UI language. The API sends a translation key and raw values
 * (people as ids, `approved` as a boolean, dates as ISO strings); this resolves names through the
 * organization's members and picks the approved/rejected wording.
 */
@Injectable({ providedIn: 'root' })
export class NotificationText {
  private readonly transloco = inject(TranslocoService);
  private readonly directory = inject(OrgDirectory);
  private readonly language = inject(LanguageService);

  describe(notification: AppNotification): string {
    const p = notification.params;
    const t = (key: string, params: Record<string, unknown> = {}) =>
      this.transloco.translate(key, params);
    const person = (id: unknown) => this.directory.nameOf(id) ?? t('notifications.someone');
    const outcome =
      typeof p['approved'] === 'boolean'
        ? p['approved']
          ? '.approved'
          : p['comment']
            ? '.rejectedWithComment'
            : '.rejected'
        : '';
    const key = `${notification.titleKey}${outcome}`;
    const params = {
      key: p['key'] ?? '',
      title: p['title'] ?? '',
      actor: person(p['actorId']),
      requester: person(p['requesterId']),
      week: typeof p['week'] === 'string' ? p['week'].slice(6) : '',
      comment: p['comment'] ?? '',
      date: typeof p['reviewDate'] === 'string' ? this.date(p['reviewDate']) : '',
      type: typeof p['type'] === 'string' ? t(`reportType.${p['type']}`) : '',
      format: p['format'] ?? '',
      fileName: p['fileName'] ?? '',
    };
    const text = t(key, params);
    // A kind this build doesn't know yet (or a key without translation) still says something.
    return text === key || typeof text !== 'string' ? t('notifications.unknown') : text;
  }

  private date(iso: string): string {
    return new Intl.DateTimeFormat(this.language.current(), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
  }
}
