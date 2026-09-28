const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 hr ago", "2 days ago", then a date: when something happened. */
export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const elapsed = now - Date.parse(iso);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (elapsed < MINUTE) return format.format(0, 'second');
  if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 7 * DAY) return format.format(-Math.floor(elapsed / DAY), 'day');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** The calendar day of a moment in a time zone, for grouping ("Today", "Yesterday", a date). */
export function dayOf(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
