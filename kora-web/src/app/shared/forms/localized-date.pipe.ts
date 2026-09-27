import { Pipe, PipeTransform } from '@angular/core';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO date or timestamp → date in the UI language, via `Intl` (no Angular locale data to register
 * for fr/rw). A calendar date (`2026-11-01`: target dates, milestones) is formatted as that day
 * everywhere; `new Date()` would read it as UTC midnight and show the day before west of UTC.
 */
export function formatLocalizedDate(
  value: string | null | undefined,
  locale: string,
  style: Intl.DateTimeFormatOptions['dateStyle'] = 'medium',
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timeZone = DATE_ONLY.test(value) ? 'UTC' : undefined;
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone }).format(date);
}

/**
 * Pass the current language so the pipe re-runs when it changes:
 * `{{ member.joinedAt | localizedDate: language.current() }}`.
 */
@Pipe({ name: 'localizedDate' })
export class LocalizedDatePipe implements PipeTransform {
  transform(
    value: string | null | undefined,
    locale: string,
    style: Intl.DateTimeFormatOptions['dateStyle'] = 'medium',
  ): string {
    return formatLocalizedDate(value, locale, style);
  }
}
