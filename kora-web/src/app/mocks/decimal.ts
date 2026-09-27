/**
 * Exact decimal arithmetic for money in the mock API (the real API uses BigDecimal). Amounts are
 * held as BigInt counts of 1/10 000, the contract's finest precision (4 decimals).
 */
const SCALE = 4;
const FACTOR = 10n ** BigInt(SCALE);

export function toUnits(amount: string): bigint {
  const negative = amount.startsWith('-');
  const [whole, fraction = ''] = amount.replace('-', '').split('.');
  const units = BigInt(whole) * FACTOR + BigInt(fraction.padEnd(SCALE, '0').slice(0, SCALE));
  return negative ? -units : units;
}

/** Units → decimal string with exactly `digits` decimals, rounding half up. */
export function fromUnits(units: bigint, digits: number): string {
  const divisor = 10n ** BigInt(SCALE - digits);
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const rounded = (abs + divisor / 2n) / divisor;
  const text = rounded.toString().padStart(digits + 1, '0');
  const result = digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`;
  return negative && rounded !== 0n ? `-${result}` : result;
}

export function sum(amounts: readonly string[]): bigint {
  return amounts.reduce((total, amount) => total + toUnits(amount), 0n);
}

/** amount × percent / 100, exactly (percent may have 2 decimals). */
export function percentOf(amount: string, percent: number): bigint {
  const percentHundredths = BigInt(Math.round(percent * 100));
  return (toUnits(amount) * percentHundredths) / 10_000n;
}

/** Decimal places a currency uses, as the API scales amounts (RWF 0, USD 2). */
export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
