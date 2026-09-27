import { Pipe, PipeTransform } from '@angular/core';
import { Money } from '../../core/api/api.models';

/*
 * Money is `{ amount: "decimal string", currency }` in the organization's currency (contract
 * 0.2.0). Amounts are never turned into binary floats: `Intl.NumberFormat` formats decimal strings
 * exactly (ECMA-402 "NumberFormat v3", in every evergreen browser and Node 20+), and user input is
 * parsed into a canonical decimal string, never a number.
 */

type StringFormatter = (value: string) => string;

/** Decimal places a currency uses (RWF 0, USD 2, BHD 3). */
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

/** "RWF 150,000,000" / "150 000 000 RWF", in the UI language. Empty for no money. */
export function formatMoney(money: Money | null | undefined, locale: string): string {
  if (!money) return '';
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currency,
    });
    return (formatter.format as unknown as StringFormatter)(money.amount);
  } catch {
    return `${money.amount} ${money.currency}`;
  }
}

/**
 * User input → canonical decimal string for the currency, or `null` when it isn't a valid amount.
 * Accepts spaces and apostrophes as thousand separators and either "." or "," as the decimal mark
 * (so "1 250 000", "1,250.50" and "1250,5" all work); more decimals than the currency has is invalid.
 */
export function parseAmount(input: string, currency: string): string | null {
  let text = input.trim().replace(/[\s'\u00a0\u202f]/g, '');
  if (!text) return null;
  const marks = text.match(/[.,]/g) ?? [];
  if (marks.length > 1) {
    // "1,250,000.50": the last mark is decimal only if it differs from the others.
    const last = text.search(/[.,][^.,]*$/);
    const lastMark = text[last];
    const others = marks.slice(0, -1);
    if (others.every((m) => m === lastMark)) {
      text = text.replace(/[.,]/g, ''); // "1,250,000": all grouping
    } else {
      text = text.slice(0, last).replace(/[.,]/g, '') + '.' + text.slice(last + 1);
    }
  } else if (marks.length === 1) {
    const [whole, fraction] = text.split(/[.,]/);
    // "1,250" with exactly three digits after a comma and no currency decimals of 3: grouping.
    text =
      fraction.length === 3 && currencyDigits(currency) !== 3
        ? whole + fraction
        : `${whole}.${fraction}`;
  }
  const match = /^(\d{1,15})(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  const trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length > currencyDigits(currency)) return null;
  const canonicalWhole = whole.replace(/^0+(?=\d)/, '');
  return trimmed ? `${canonicalWhole}.${trimmed}` : canonicalWhole;
}

/** `{{ project.budget | money: language.current() }}` */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(money: Money | null | undefined, locale: string): string {
    return formatMoney(money, locale);
  }
}

/** Percent with up to one decimal, in the UI language: 33.33 → "33.3 %" (fr), "33.3%" (en). */
export function formatPercent(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
    value / 100,
  );
}

@Pipe({ name: 'percent100' })
export class Percent100Pipe implements PipeTransform {
  transform(value: number | null | undefined, locale: string): string {
    return formatPercent(value, locale);
  }
}

/** Hours with up to two decimals: 1234.5 → "1,234.5 h". */
export function formatHours(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} h`;
}

@Pipe({ name: 'hours' })
export class HoursPipe implements PipeTransform {
  transform(value: number | null | undefined, locale: string): string {
    return formatHours(value, locale);
  }
}
