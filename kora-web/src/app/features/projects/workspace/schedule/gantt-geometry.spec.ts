import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  WEEKEND_RULE,
  addDays,
  arrowPath,
  barOf,
  daysBetween,
  isWorkingDay,
  localToday,
  ticks,
  timeline,
  weekdayOf,
  workingDaysBetween,
  xOf,
} from './gantt-geometry';

describe('Gantt geometry', () => {
  it('counts calendar days in UTC, across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
    expect(weekdayOf('2026-09-27')).toBe('SUNDAY');
    expect(weekdayOf('2026-09-28')).toBe('MONDAY');
    expect(localToday(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07');
  });

  it('counts working days, skipping weekends and holidays', () => {
    const rule = { ...WEEKEND_RULE, holidays: [{ date: '2026-10-01' }] };

    expect(isWorkingDay('2026-10-03', rule)).toBe(false); // Saturday
    expect(isWorkingDay('2026-10-01', rule)).toBe(false); // holiday
    // Mon 28 Sep → Fri 9 Oct: ten weekdays, one of them a holiday.
    expect(workingDaysBetween('2026-09-28', '2026-10-09', rule)).toBe(9);
    expect(workingDaysBetween('2026-10-09', '2026-09-28', rule)).toBe(0);
  });

  it('covers every span with room either side, aligned to the zoom', () => {
    const spans = [
      { start: '2026-10-07', finish: '2026-10-20' },
      { start: '2026-10-01', finish: '2026-10-05' },
    ];

    const days = timeline(spans, '2026-10-01', 'day');
    expect(days.origin).toBe('2026-09-29');
    expect(days.dayWidth).toBe(28);
    expect(addDays(days.origin, days.days - 1)).toBe('2026-10-27');

    const weeks = timeline(spans, '2026-10-01', 'week');
    expect(weekdayOf(weeks.origin)).toBe('MONDAY');
    expect(weeks.origin).toBe('2026-09-28');

    const months = timeline(spans, '2026-10-01', 'month');
    expect(months.origin).toBe('2026-09-01');
    expect(months.width).toBe(months.days * 3);
  });

  it('draws a bar from the start of its first day to the end of its last', () => {
    const line = timeline([], '2026-10-01', 'day'); // origin 2026-09-29

    expect(xOf(line, '2026-10-01')).toBe(56);
    expect(barOf(line, { start: '2026-10-01', finish: '2026-10-02' })).toEqual({
      x: 56,
      width: 56,
      milestone: false,
    });
    expect(barOf(line, { start: '2026-10-01', finish: '2026-10-01' }, true).width).toBe(0);
  });

  it('labels months above days, and years above months', () => {
    const line = timeline([{ start: '2026-10-28', finish: '2026-11-03' }], '2026-10-28', 'day');
    const { top, bottom } = ticks(line, 'day', 'en');

    expect(top.map((t) => t.label)).toEqual(['October 2026', 'November 2026']);
    expect(bottom[0]).toEqual({ x: 0, label: '26' });
    expect(bottom).toHaveLength(line.days);

    const months = ticks(timeline([], '2026-12-10', 'month'), 'month', 'fr');
    expect(months.top.map((t) => t.label)).toEqual(['2026', '2027']);
    expect(months.bottom[0].label).toBe('déc.');
  });

  it('routes a link from the side its type leaves to the side it enters', () => {
    const a = { x: 0, width: 50, milestone: false };
    const b = { x: 100, width: 30, milestone: false };
    const y = (row: number) => HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2;

    // Finish to start with room: out of A's end, straight into B's start.
    expect(arrowPath(a, 0, b, 1, 'FS')).toBe(`M50,${y(0)} H58 V${y(1)} H100`);
    // Start to start: out of A's start (to the left), into B's start.
    expect(arrowPath(a, 0, b, 1, 'SS')).toBe(`M0,${y(0)} H-8 V${y(1)} H100`);
    // Finish to finish: into B's end, from the right.
    expect(arrowPath(a, 0, b, 1, 'FF')).toBe(`M50,${y(0)} H138 V${y(1)} H130`);
    // No room (a lead): detour between the rows and come back in from the left.
    const overlap = { x: 40, width: 30, milestone: false };
    expect(arrowPath(a, 0, overlap, 2, 'FS')).toBe(
      `M50,${y(0)} H58 V${y(2) - ROW_HEIGHT / 2} H32 V${y(2)} H40`,
    );
  });
});
