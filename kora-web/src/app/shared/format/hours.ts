/**
 * Hours as people type them: "7.5" or "7,5" (French uses a decimal comma), quarter hours only,
 * 0–24 in a cell. Empty means nothing logged.
 */

/** Hours, 0 for an empty cell, or null when the text isn't a valid quarter-hour amount. */
export function parseHours(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) return null;
  const hours = Number(trimmed);
  return hours <= 24 && (hours * 4) % 1 === 0 ? hours : null;
}

/**
 * Planned hours for a week (0–168, two decimals at most), 0 for an empty cell, or null. Separate
 * from `parseHours`: a week isn't capped at a day's 24 hours nor held to quarter hours.
 */
export function parseWeeklyHours(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const hours = Number(trimmed);
  return hours <= 168 ? hours : null;
}

/** "7.5" / "7,5" in the UI language; empty for zero. */
export function formatHours(hours: number, locale: string): string {
  if (!hours) return '';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(
    hours,
  );
}

/** Totals keep two decimals at most (quarter hours add up exactly). */
export function addHours(values: readonly number[]): number {
  return Math.round(values.reduce((t, h) => t + h, 0) * 100) / 100;
}
