import { CycleError, Link, WorkingDays, criticalPath, loopClosedBy } from './cpm';

const fs = (predecessor: string, successor: string, lag = 0): Link => ({
  predecessor,
  successor,
  type: 'FS',
  lag,
});

describe('critical path method', () => {
  it('matches the textbook network (ES/EF/LS/LF, total and free float)', () => {
    // A(3) → B(2) → D(3) → E(2); A → C(4) → E
    const result = criticalPath(
      [
        { id: 'A', duration: 3, notBefore: 0 },
        { id: 'B', duration: 2, notBefore: 0 },
        { id: 'C', duration: 4, notBefore: 0 },
        { id: 'D', duration: 3, notBefore: 0 },
        { id: 'E', duration: 2, notBefore: 0 },
      ],
      [fs('A', 'B'), fs('A', 'C'), fs('B', 'D'), fs('C', 'E'), fs('D', 'E')],
    );

    const row = (id: string) => result.timings.get(id);
    expect(result.finish).toBe(10);
    expect(row('A')).toMatchObject({
      earlyStart: 0,
      earlyFinish: 3,
      lateStart: 0,
      lateFinish: 3,
      totalFloat: 0,
    });
    expect(row('B')).toMatchObject({
      earlyStart: 3,
      earlyFinish: 5,
      lateStart: 3,
      lateFinish: 5,
      totalFloat: 0,
    });
    expect(row('C')).toMatchObject({
      earlyStart: 3,
      earlyFinish: 7,
      lateStart: 4,
      lateFinish: 8,
      totalFloat: 1,
      freeFloat: 1,
      critical: false,
    });
    expect(row('D')).toMatchObject({ earlyStart: 5, earlyFinish: 8, totalFloat: 0 });
    expect(row('E')).toMatchObject({ earlyStart: 8, earlyFinish: 10, totalFloat: 0 });
    expect(result.order).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('applies the four link types with lags and leads', () => {
    const activities = [
      { id: 'P', duration: 4, notBefore: 0 },
      { id: 'S', duration: 3, notBefore: 0 },
    ];
    const start = (type: Link['type'], lag: number) =>
      criticalPath(activities, [{ predecessor: 'P', successor: 'S', type, lag }]).timings.get('S')
        ?.earlyStart;

    expect(start('FS', 0)).toBe(4);
    expect(start('FS', 2)).toBe(6);
    expect(start('FS', -2)).toBe(2); // a lead overlaps the predecessor
    expect(start('SS', 1)).toBe(1);
    expect(start('FF', 0)).toBe(1); // finishes with P: 4 - 3
    expect(start('SF', 5)).toBe(2); // finishes 5 after P starts
  });

  it('honours a start-no-earlier-than day and never starts before day 0', () => {
    const result = criticalPath(
      [
        { id: 'A', duration: 2, notBefore: 0 },
        { id: 'B', duration: 2, notBefore: 6 },
        { id: 'C', duration: 1, notBefore: 0 },
      ],
      [fs('A', 'B'), { predecessor: 'A', successor: 'C', type: 'SS', lag: -5 }],
    );

    expect(result.timings.get('B')?.earlyStart).toBe(6);
    expect(result.timings.get('C')?.earlyStart).toBe(0);
    expect(result.timings.get('A')).toMatchObject({ totalFloat: 4, critical: false });
  });

  it('refuses a loop and names it', () => {
    expect(() =>
      criticalPath(
        ['A', 'B', 'C'].map((id) => ({ id, duration: 1, notBefore: 0 })),
        [fs('A', 'B'), fs('B', 'C'), fs('C', 'B')],
      ),
    ).toThrow(CycleError);
    try {
      criticalPath(
        ['A', 'B', 'C'].map((id) => ({ id, duration: 1, notBefore: 0 })),
        [fs('A', 'B'), fs('B', 'C'), fs('C', 'B')],
      );
    } catch (error) {
      expect((error as CycleError).cycle).toEqual(['B', 'C', 'B']);
    }
  });

  it('finds the loop a new link would close', () => {
    const links = [fs('A', 'B'), fs('B', 'C')];

    expect(loopClosedBy(links, 'C', 'A')).toEqual(['C', 'A', 'B', 'C']);
    expect(loopClosedBy(links, 'A', 'C')).toBeNull();
  });

  it('counts working days, skipping weekends and holidays', () => {
    // 2026-09-26 is a Saturday; 2026-09-30 a holiday here.
    const days = new WorkingDays(
      new Set(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
      new Set(['2026-09-30']),
      '2026-09-26',
    );

    expect(days.date(0)).toBe('2026-09-28');
    expect(days.date(1)).toBe('2026-09-29');
    expect(days.date(2)).toBe('2026-10-01');
    expect(days.index('2026-10-01')).toBe(2);
    expect(days.index('2026-09-30')).toBe(2); // the next working day
    expect(days.index('2026-09-24')).toBe(-2);
  });
});
