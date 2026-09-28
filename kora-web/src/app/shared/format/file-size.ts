/** "184 kB", "1.2 MB" in the UI language (decimal units, as file managers show them). */
export function formatFileSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes >= 1_000_000
      ? [bytes / 1_000_000, 'megabyte']
      : bytes >= 1_000
        ? [bytes / 1_000, 'kilobyte']
        : [bytes, 'byte'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'megabyte' ? 1 : 0,
  }).format(value);
}
