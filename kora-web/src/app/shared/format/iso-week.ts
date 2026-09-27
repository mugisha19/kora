/**
 * ISO weeks ("2026-W40", Monday to Sunday), the timesheet's unit. Dates are `yyyy-mm-dd` strings
 * computed in UTC, so no time zone moves a day.
 */

const MS_PER_DAY = 86_400_000;
const WEEK = /^(\d{4})-W(\d{2})$/;

const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;
const fromDay = (day: number) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

export function plusDays(date: string, days: number): string {
  return fromDay(toDay(date) + days);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (((toDay(date) + 3) % 7) + 7) % 7;
}

export function mondayOf(date: string): string {
  return plusDays(date, -weekdayIndex(date));
}

/** "2026-W40": the ISO year is the year of the week's Thursday. */
export function isoWeekOf(date: string): string {
  const thursday = plusDays(mondayOf(date), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor((toDay(thursday) - toDay(`${year}-01-01`)) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isValidWeek(week: string): boolean {
  const match = WEEK.exec(week);
  if (!match) return false;
  const n = Number(match[2]);
  return n >= 1 && n <= 53 && isoWeekOf(weekStartOf(week)) === week;
}

/** The Monday of an ISO week. */
export function weekStartOf(week: string): string {
  const match = WEEK.exec(week);
  if (!match) throw new Error(`Not an ISO week: ${week}`);
  const [, year, n] = match;
  // 4 January is always in week 1.
  const firstMonday = mondayOf(`${year}-01-04`);
  return plusDays(firstMonday, (Number(n) - 1) * 7);
}

export function shiftWeek(week: string, weeks: number): string {
  return isoWeekOf(plusDays(weekStartOf(week), weeks * 7));
}

/** The seven dates of a week, Monday first. */
export function daysOfWeek(week: string): string[] {
  const monday = weekStartOf(week);
  return Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
}
