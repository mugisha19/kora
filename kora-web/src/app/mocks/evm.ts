/**
 * Earned value arithmetic (feature 17) as the API does it: exact decimal money (BigInt units of
 * 1/10 000, see `decimal.ts`), rounded to the currency only at the end; indices to two decimals
 * and never fed back into money; anything that would divide by zero is left out with its reason.
 */

export type EacMethod = 'TYPICAL' | 'ATYPICAL' | 'COMPOSITE';

export interface EvmInput {
  bac: bigint;
  pv: bigint;
  /** Null when the percent-complete method has nothing to measure with. */
  ev: bigint | null;
  evMissingReason?: string;
  ac: bigint;
  method: EacMethod;
}

export interface EvmFigures {
  bac: bigint;
  pv: bigint;
  ev?: bigint;
  ac: bigint;
  sv?: bigint;
  cv?: bigint;
  spi?: number;
  cpi?: number;
  eac?: bigint;
  etc?: bigint;
  vac?: bigint;
  tcpi?: number;
  unavailable: { metric: string; reason: string }[];
}

/** a ÷ b to two decimals, half-even (b ≠ 0). */
export function ratio(a: bigint, b: bigint): number {
  const negative = a < 0n !== b < 0n;
  const x = a < 0n ? -a : a;
  const y = b < 0n ? -b : b;
  const hundredths = (x * 100n) / y;
  const remainder = (x * 100n) % y;
  let rounded = hundredths;
  if (remainder * 2n > y || (remainder * 2n === y && hundredths % 2n === 1n)) rounded += 1n;
  const value = Number(rounded) / 100;
  return negative ? -value : value;
}

/** a ÷ b in money units, half-even (b ≠ 0). */
function divide(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  const twice = (r < 0n ? -r : r) * 2n;
  const bAbs = b < 0n ? -b : b;
  if (twice > bAbs || (twice === bAbs && q % 2n !== 0n)) return q + (a < 0n !== b < 0n ? -1n : 1n);
  return q;
}

/** Estimate at completion by method; undefined when the formula divides by zero. */
export function eacOf(method: EacMethod, bac: bigint, pv: bigint, ev: bigint, ac: bigint) {
  switch (method) {
    case 'TYPICAL':
      // BAC ÷ CPI = BAC × AC ÷ EV: today's cost efficiency continues.
      return ev === 0n ? undefined : divide(bac * ac, ev);
    case 'ATYPICAL':
      // AC + (BAC − EV): the variance so far was a one-off.
      return ac + (bac - ev);
    case 'COMPOSITE':
      // AC + (BAC − EV) ÷ (CPI × SPI) = AC + (BAC − EV) × AC × PV ÷ EV².
      return ev === 0n || ac === 0n || pv === 0n
        ? undefined
        : ac + divide((bac - ev) * ac * pv, ev * ev);
  }
}

export function evmFigures({ bac, pv, ev, evMissingReason, ac, method }: EvmInput): EvmFigures {
  const unavailable: EvmFigures['unavailable'] = [];
  if (bac === 0n) unavailable.push({ metric: 'bac', reason: 'The WBS has no planned cost' });
  if (ev === null) {
    for (const metric of ['ev', 'sv', 'cv', 'spi', 'cpi', 'eac', 'etc', 'vac', 'tcpi']) {
      unavailable.push({ metric, reason: evMissingReason ?? 'Nothing to measure progress with' });
    }
    return { bac, pv, ac, unavailable };
  }
  const figures: EvmFigures = { bac, pv, ev, ac, sv: ev - pv, cv: ev - ac, unavailable };
  if (pv === 0n)
    unavailable.push({ metric: 'spi', reason: 'No work was planned to be done by now' });
  else figures.spi = ratio(ev, pv);
  if (ac === 0n) unavailable.push({ metric: 'cpi', reason: 'No actual cost yet' });
  else figures.cpi = ratio(ev, ac);
  const eac = eacOf(method, bac, pv, ev, ac);
  if (eac === undefined) {
    const reason =
      ev === 0n ? 'Nothing has been earned yet' : 'No actual cost or planned value yet';
    for (const metric of ['eac', 'etc', 'vac']) unavailable.push({ metric, reason });
  } else {
    figures.eac = eac;
    figures.etc = eac - ac;
    figures.vac = bac - eac;
  }
  if (bac - ac === 0n) unavailable.push({ metric: 'tcpi', reason: 'The whole budget is spent' });
  else figures.tcpi = ratio(bac - ev, bac - ac);
  return figures;
}

/** Share of a window [start, finish] passed by the end of `date`, as numerator/denominator days. */
export function elapsedDays(start: string, finish: string, date: string): [bigint, bigint] {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const total = BigInt(day(finish) - day(start) + 1);
  if (date < start) return [0n, total];
  if (date >= finish) return [total, total];
  return [BigInt(day(date) - day(start) + 1), total];
}
