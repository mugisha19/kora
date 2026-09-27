import { toUnits } from './decimal';
import { elapsedDays, evmFigures, ratio } from './evm';

const u = (amount: string) => toUnits(amount);

describe('earned value arithmetic', () => {
  // The textbook project: BAC 100 000, half the work planned by now, 40% earned, 45 000 spent.
  const textbook = { bac: u('100000'), pv: u('50000'), ev: u('40000'), ac: u('45000') };

  it('reproduces the textbook figures exactly', () => {
    const f = evmFigures({ ...textbook, method: 'TYPICAL' });

    expect(f.sv).toBe(u('-10000'));
    expect(f.cv).toBe(u('-5000'));
    expect(f.spi).toBe(0.8);
    expect(f.cpi).toBe(0.89);
    expect(f.eac).toBe(u('112500'));
    expect(f.etc).toBe(u('67500'));
    expect(f.vac).toBe(u('-12500'));
    expect(f.tcpi).toBe(1.09);
    expect(f.unavailable).toEqual([]);
  });

  it('forecasts with each EAC method', () => {
    expect(evmFigures({ ...textbook, method: 'ATYPICAL' }).eac).toBe(u('105000'));
    // 45 000 + 60 000 × 45 000 × 50 000 ÷ 40 000² = 129 375
    expect(evmFigures({ ...textbook, method: 'COMPOSITE' }).eac).toBe(u('129375'));
  });

  it('leaves out what would divide by zero, and says why', () => {
    const f = evmFigures({ bac: u('100000'), pv: 0n, ev: 0n, ac: 0n, method: 'TYPICAL' });

    expect(f.spi).toBeUndefined();
    expect(f.eac).toBeUndefined();
    expect(f.unavailable).toEqual([
      { metric: 'spi', reason: 'No work was planned to be done by now' },
      { metric: 'cpi', reason: 'No actual cost yet' },
      { metric: 'eac', reason: 'Nothing has been earned yet' },
      { metric: 'etc', reason: 'Nothing has been earned yet' },
      { metric: 'vac', reason: 'Nothing has been earned yet' },
    ]);
    expect(f.tcpi).toBe(1);
  });

  it('rounds indices half-even to two decimals', () => {
    expect(ratio(15n, 1000n)).toBe(0.02); // 0.015 → 0.02 (to even)
    expect(ratio(25n, 1000n)).toBe(0.02); // 0.025 → 0.02 (to even)
    expect(ratio(26n, 1000n)).toBe(0.03);
    expect(ratio(-1n, 3n)).toBe(-0.33);
  });

  it('counts the days of a planning window that have passed', () => {
    expect(elapsedDays('2026-01-01', '2026-01-10', '2026-01-04')).toEqual([4n, 10n]);
    expect(elapsedDays('2026-01-01', '2026-01-10', '2025-12-31')).toEqual([0n, 10n]);
    expect(elapsedDays('2026-01-01', '2026-01-10', '2026-02-01')).toEqual([10n, 10n]);
  });
});
