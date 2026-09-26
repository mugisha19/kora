import { Pipe, PipeTransform } from '@angular/core';

/**
 * ISO date → date in the UI language, via `Intl` (no Angular locale data to register for fr/rw).
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
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale, { dateStyle: style }).format(date);
  }
}
