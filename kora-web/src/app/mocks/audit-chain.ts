/**
 * The mock's tamper-evident audit chain: each row stores a hash of the previous row's hash and its
 * own content, so changing or removing a row breaks every hash after it. The API uses SHA-256; the
 * mock uses two rounds of 32-bit FNV-1a (synchronous, and enough to show the idea).
 */

function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The hash of a row, chained to the previous row's hash (empty for the first row). */
export function chainHash(previous: string, row: object): string {
  const text = previous + JSON.stringify(row);
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x01000193);
}

/**
 * Rechecks a chain, oldest first: how many rows were checked and the first whose hash doesn't
 * match (a row was changed, or one before it was removed).
 */
export function verifyChain<T extends { id: string; hash: string }>(
  rows: readonly T[],
): { checked: number; firstBrokenId?: string } {
  let previous = '';
  for (const row of rows) {
    const { hash, ...content } = row;
    if (chainHash(previous, content) !== hash)
      return { checked: rows.length, firstBrokenId: row.id };
    previous = hash;
  }
  return { checked: rows.length };
}
