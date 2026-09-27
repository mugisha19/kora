import { currencyDigits, formatHours, formatMoney, formatPercent, parseAmount } from './money';

describe('money', () => {
  it('knows how many decimals a currency uses', () => {
    expect(currencyDigits('RWF')).toBe(0);
    expect(currencyDigits('USD')).toBe(2);
    expect(currencyDigits('BHD')).toBe(3);
  });

  // Intl separates with (narrow) non-breaking spaces; compare with plain ones.
  const plain = (text: string) => text.replace(/\s/g, ' ');

  it('formats decimal strings exactly, in the UI language', () => {
    expect(plain(formatMoney({ amount: '150000000', currency: 'RWF' }, 'en'))).toBe(
      'RWF 150,000,000',
    );
    expect(formatMoney({ amount: '99.90', currency: 'USD' }, 'en')).toBe('$99.90');
    // A float would round this; the string is formatted as is.
    expect(formatMoney({ amount: '12345678901234.56', currency: 'USD' }, 'en')).toBe(
      '$12,345,678,901,234.56',
    );
    expect(plain(formatMoney({ amount: '1250000', currency: 'RWF' }, 'fr'))).toBe('1 250 000 RWF');
    expect(formatMoney(undefined, 'en')).toBe('');
  });

  describe('parseAmount', () => {
    it.each([
      ['1 250 000', 'RWF', '1250000'],
      ['1,250,000', 'RWF', '1250000'],
      ["1'250'000", 'RWF', '1250000'],
      ['1 250 000', 'RWF', '1250000'],
      ['99.90', 'USD', '99.9'],
      ['99,9', 'USD', '99.9'],
      ['1,250.50', 'USD', '1250.5'],
      ['1.250,50', 'USD', '1250.5'],
      ['0042', 'RWF', '42'],
      ['100.000', 'RWF', '100000'],
      // One mark followed by three digits is a thousands separator ("1,250" = 1250).
      ['1.234', 'USD', '1234'],
    ])('reads %s (%s) as %s', (input, currency, expected) => {
      expect(parseAmount(input, currency)).toBe(expected);
    });

    it.each([
      ['', 'RWF'],
      ['abc', 'RWF'],
      ['-5', 'RWF'],
      ['10.5', 'RWF'],
      ['1.2345', 'USD'],
      ['1234567890123456', 'RWF'],
    ])('rejects %s (%s)', (input, currency) => {
      expect(parseAmount(input, currency)).toBeNull();
    });
  });

  it('formats percentages and hours', () => {
    expect(formatPercent(76.36, 'en')).toBe('76.4%');
    expect(formatPercent(null, 'en')).toBe('');
    expect(formatHours(1234.5, 'en')).toBe('1,234.5 h');
  });
});
