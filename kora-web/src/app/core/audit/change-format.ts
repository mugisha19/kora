import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { FieldChange } from '../api/api.models';
import { LanguageService } from '../i18n/language.service';
import { OrgDirectory } from '../people/org-directory';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENUM = /^[A-Z][A-Z0-9_]+$/;
/** Internal fields the API records but never shows (board order, sequence numbers, digests). */
const HIDDEN = new Set(['rank', 'number', 'key', 'completedAt', 'sha256']);

export interface ChangeLine {
  readonly field: string;
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
}

/**
 * Audit changes and activity in words (features 18–19). Field names are the API's (`assigneeId`,
 * `reviewDate`): known ones are translated, the rest split into words. Values become people's
 * names, numbers and dates in the UI language, and readable enum words.
 */
@Injectable({ providedIn: 'root' })
export class ChangeFormat {
  private readonly transloco = inject(TranslocoService);
  private readonly directory = inject(OrgDirectory);
  private readonly language = inject(LanguageService);

  fieldLabel(field: string): string {
    const key = `audit.fields.${field}`;
    const translated = this.transloco.translate(key);
    return translated !== key ? translated : sentence(field.replace(/Id$/, ''));
  }

  /** "task", "change-request" → "Task", "Change request" (translated when known). */
  entityLabel(entityType: string): string {
    const key = `entityType.${entityType}`;
    const translated = this.transloco.translate(key);
    return translated !== key ? translated : sentence(entityType.replaceAll('-', ' '));
  }

  /** The changed fields worth showing, in order. */
  lines(changes: Readonly<Record<string, FieldChange>>): ChangeLine[] {
    return Object.entries(changes)
      .filter(([field]) => !HIDDEN.has(field))
      .map(([field, change]) => ({
        field,
        label: this.fieldLabel(field),
        before: 'before' in change ? this.value(field, change.before) : null,
        after: 'after' in change ? this.value(field, change.after) : null,
      }));
  }

  /** The names of changed fields, e.g. "status, assignee". */
  fieldList(fields: readonly string[]): string {
    const shown = fields.filter((f) => !HIDDEN.has(f)).map((f) => this.fieldLabel(f).toLowerCase());
    return new Intl.ListFormat(this.language.current(), { type: 'conjunction' }).format(shown);
  }

  value(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') {
      return this.transloco.translate(value ? 'common.yes' : 'common.no');
    }
    if (typeof value === 'number') {
      return new Intl.NumberFormat(this.language.current()).format(value);
    }
    if (typeof value !== 'string') return JSON.stringify(value);
    if (UUID.test(value) && /Id$/.test(field)) {
      return this.directory.nameOf(value) ?? this.transloco.translate('audit.someoneElse');
    }
    // Currency codes (budgetCurrency: RWF) stay as they are; enum names read as words.
    if (/Currency$/.test(field)) return value;
    if (DATE.test(value)) {
      return new Intl.DateTimeFormat(this.language.current(), {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00Z`));
    }
    if (ENUM.test(value)) return sentence(value.toLowerCase().replaceAll('_', ' '));
    return value;
  }
}

/** "reviewDate" → "Review date", "in progress" → "In progress". */
function sentence(text: string): string {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
