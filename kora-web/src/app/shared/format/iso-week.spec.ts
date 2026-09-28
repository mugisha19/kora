import {
  daysOfWeek,
  isValidWeek,
  isoWeekOf,
  mondayOf,
  plusDays,
  shiftWeek,
  weekStartOf,
  weekdayIndex,
} from './iso-week';

describe('ISO weeks', () => {
  it('numbers weeks by their Thursday, across year ends', () => {
    expect(isoWeekOf('2026-09-28')).toBe('2026-W40');
    expect(isoWeekOf('2026-10-04')).toBe('2026-W40');
    // 1 January 2027 is a Friday: it belongs to the last week of 2026.
    expect(isoWeekOf('2027-01-01')).toBe('2026-W53');
    // 29 December 2025 is a Monday whose Thursday is in 2026.
    expect(isoWeekOf('2025-12-29')).toBe('2026-W01');
  });

  it('finds Mondays and weekdays', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0);
    expect(weekdayIndex('2026-10-04')).toBe(6);
    expect(mondayOf('2026-10-04')).toBe('2026-09-28');
    expect(plusDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(plusDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('goes from a week to its days and to other weeks', () => {
    expect(weekStartOf('2026-W01')).toBe('2025-12-29');
    expect(daysOfWeek('2026-W40')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52');
  });

  it('accepts only weeks that exist', () => {
    expect(isValidWeek('2026-W53')).toBe(true);
    expect(isValidWeek('2027-W53')).toBe(false);
    expect(isValidWeek('2026-W00')).toBe(false);
    expect(isValidWeek('2026-40')).toBe(false);
  });
});
