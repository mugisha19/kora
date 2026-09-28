import { addHours, formatHours, parseHours, parseWeeklyHours } from './hours';

describe('hours', () => {
  it('reads a day’s hours with a decimal point or comma, in quarters up to 24', () => {
    expect(parseHours('')).toBe(0);
    expect(parseHours(' 7.5 ')).toBe(7.5);
    expect(parseHours('7,25')).toBe(7.25);
    expect(parseHours('24')).toBe(24);
    expect(parseHours('7.3')).toBeNull();
    expect(parseHours('24.25')).toBeNull();
    expect(parseHours('-1')).toBeNull();
    expect(parseHours('seven')).toBeNull();
  });

  it('reads a week’s planned hours up to 168, not held to quarters', () => {
    expect(parseWeeklyHours('')).toBe(0);
    expect(parseWeeklyHours('35')).toBe(35);
    expect(parseWeeklyHours('12,4')).toBe(12.4);
    expect(parseWeeklyHours('168')).toBe(168);
    expect(parseWeeklyHours('169')).toBeNull();
    expect(parseWeeklyHours('1e2')).toBeNull();
  });

  it('writes hours in the UI language, empty for zero', () => {
    expect(formatHours(7.5, 'en')).toBe('7.5');
    expect(formatHours(7.5, 'fr')).toBe('7,5');
    expect(formatHours(1000, 'en')).toBe('1000');
    expect(formatHours(0, 'en')).toBe('');
  });

  it('adds quarter hours exactly', () => {
    expect(addHours([0.1, 0.2])).toBe(0.3);
    expect(addHours([7.25, 7.25, 7.5])).toBe(22);
  });
});
