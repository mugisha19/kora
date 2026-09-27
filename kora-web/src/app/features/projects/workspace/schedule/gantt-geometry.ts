import { DAYS_OF_WEEK, DayOfWeek, DependencyType } from '../../../../core/api/api.models';

/**
 * Pure geometry for the Gantt chart: calendar-day positions, header ticks, bars and dependency
 * arrows. Dates are ISO `yyyy-mm-dd` strings, computed in UTC so no time zone shifts a day.
 */

export const ZOOMS = ['day', 'week', 'month'] as const;
export type Zoom = (typeof ZOOMS)[number];

/** Pixels per calendar day at each zoom. */
export const DAY_WIDTH: Record<Zoom, number> = { day: 28, week: 10, month: 3 };
export const ROW_HEIGHT = 36;
export const BAR_HEIGHT = 16;
export const HEADER_HEIGHT = 44;

const MS_PER_DAY = 86_400_000;

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days);
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Today in the browser's time zone, as the date a person would write. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function weekdayOf(date: string): DayOfWeek {
  // 1970-01-01 was a Thursday; DAYS_OF_WEEK starts on Monday.
  return DAYS_OF_WEEK[(((dayNumber(date) + 3) % 7) + 7) % 7];
}

export interface CalendarRule {
  readonly workingDays: readonly DayOfWeek[];
  readonly holidays: readonly { date: string }[];
}

/** Saturdays and Sundays off, until the organization's calendar has loaded. */
export const WEEKEND_RULE: CalendarRule = {
  workingDays: DAYS_OF_WEEK.slice(0, 5),
  holidays: [],
};

export function isWorkingDay(date: string, rule: CalendarRule): boolean {
  return rule.workingDays.includes(weekdayOf(date)) && !rule.holidays.some((h) => h.date === date);
}

/** Working days from `start` to `finish`, both included (0 when `finish` is before `start`). */
export function workingDaysBetween(start: string, finish: string, rule: CalendarRule): number {
  let count = 0;
  for (let day = start; day <= finish; day = addDays(day, 1)) {
    if (isWorkingDay(day, rule)) count++;
  }
  return count;
}

export interface Timeline {
  /** The first day drawn. */
  readonly origin: string;
  readonly days: number;
  readonly dayWidth: number;
  readonly width: number;
}

/** A span of dates the chart must show (a task, its baseline). */
export interface Span {
  readonly start: string;
  readonly finish: string;
}

/**
 * The days the chart covers: every span, plus some room either side, starting on a Monday (week
 * zoom) or the 1st (month zoom) so the header ticks line up.
 */
export function timeline(spans: readonly Span[], fallback: string, zoom: Zoom): Timeline {
  const starts = spans.map((s) => s.start);
  const finishes = spans.map((s) => s.finish);
  const first = [fallback, ...starts].reduce((a, b) => (b < a ? b : a));
  const last = [fallback, ...finishes].reduce((a, b) => (b > a ? b : a));
  let origin = addDays(first, -2);
  if (zoom === 'week') origin = addDays(origin, -DAYS_OF_WEEK.indexOf(weekdayOf(origin)));
  if (zoom === 'month') origin = `${origin.slice(0, 8)}01`;
  const end = addDays(last, zoom === 'day' ? 7 : zoom === 'week' ? 14 : 31);
  const days = daysBetween(origin, end) + 1;
  const dayWidth = DAY_WIDTH[zoom];
  return { origin, days, dayWidth, width: days * dayWidth };
}

export function xOf(line: Timeline, date: string): number {
  return daysBetween(line.origin, date) * line.dayWidth;
}

export interface BarBox {
  readonly x: number;
  readonly width: number;
  /** A milestone: a diamond on its date. */
  readonly milestone: boolean;
}

/** A task's box: from the start of its first day to the end of its last day. */
export function barOf(line: Timeline, span: Span, milestone = false): BarBox {
  const x = xOf(line, span.start);
  if (milestone) return { x, width: 0, milestone };
  return { x, width: (daysBetween(span.start, span.finish) + 1) * line.dayWidth, milestone };
}

export function rowCenter(index: number): number {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

export interface Tick {
  readonly x: number;
  readonly label: string;
}

/**
 * Header labels: months above days (day zoom) or weeks (week zoom); years above months (month
 * zoom). `locale` names the months.
 */
export function ticks(line: Timeline, zoom: Zoom, locale: string): { top: Tick[]; bottom: Tick[] } {
  const monthLong = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const asDate = (day: string) => new Date(dayNumber(day) * MS_PER_DAY);
  const top: Tick[] = [];
  const bottom: Tick[] = [];
  for (let i = 0; i < line.days; i++) {
    const day = addDays(line.origin, i);
    const x = i * line.dayWidth;
    const firstOfMonth = day.endsWith('-01');
    if (zoom === 'month') {
      if (firstOfMonth || i === 0) bottom.push({ x, label: monthShort.format(asDate(day)) });
      if (day.slice(5) === '01-01' || i === 0) top.push({ x, label: day.slice(0, 4) });
    } else {
      if (firstOfMonth || i === 0) top.push({ x, label: monthLong.format(asDate(day)) });
      if (zoom === 'day' || weekdayOf(day) === 'MONDAY') {
        bottom.push({ x, label: String(Number(day.slice(8))) });
      }
    }
  }
  return { top, bottom };
}

/** Where a link leaves its predecessor and enters its successor, by type. */
const LEAVES_FROM_END: Record<DependencyType, boolean> = {
  FS: true,
  SS: false,
  FF: true,
  SF: false,
};
const ENTERS_AT_START: Record<DependencyType, boolean> = {
  FS: true,
  SS: true,
  FF: false,
  SF: false,
};

/**
 * An elbow path from the predecessor's start or end to the successor's start or end. When there
 * is no room to come in from the side the arrow points at, it detours between the two rows.
 */
export function arrowPath(
  from: BarBox,
  fromRow: number,
  to: BarBox,
  toRow: number,
  type: DependencyType,
): string {
  const gap = 8;
  const sx = LEAVES_FROM_END[type] ? from.x + from.width : from.x;
  const ex = ENTERS_AT_START[type] ? to.x : to.x + to.width;
  const y1 = rowCenter(fromRow);
  const y2 = rowCenter(toRow);
  const out = LEAVES_FROM_END[type] ? sx + gap : sx - gap;
  if (ENTERS_AT_START[type]) {
    const inX = ex - gap;
    if (out <= inX) return `M${sx},${y1} H${out} V${y2} H${ex}`;
    const midY = y2 + (y2 >= y1 ? -ROW_HEIGHT / 2 : ROW_HEIGHT / 2);
    return `M${sx},${y1} H${out} V${midY} H${inX} V${y2} H${ex}`;
  }
  const inX = Math.max(out, ex + gap);
  return `M${sx},${y1} H${inX} V${y2} H${ex}`;
}
