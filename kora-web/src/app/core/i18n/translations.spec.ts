import en from '../../../../public/i18n/en.json';
import fr from '../../../../public/i18n/fr.json';
import rw from '../../../../public/i18n/rw.json';

/**
 * Translation parity (feature 23): French and Kinyarwanda must have exactly the English keys,
 * no empty strings, and the same `{{ placeholders }}`, otherwise the build fails.
 */
type Json = string | { [key: string]: Json };

function flatten(tree: Json, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  if (typeof tree === 'string') {
    entries.set(prefix, tree);
    return entries;
  }
  for (const [key, value] of Object.entries(tree)) {
    for (const [path, text] of flatten(value, prefix ? `${prefix}.${key}` : key)) {
      entries.set(path, text);
    }
  }
  return entries;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();
}

const english = flatten(en);

describe.each([
  ['fr', flatten(fr)],
  ['rw', flatten(rw)],
])('%s translations', (_lang, translations) => {
  it('have exactly the English keys', () => {
    expect([...translations.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('have no empty strings', () => {
    const empty = [...translations].filter(([, text]) => text.trim() === '').map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('keep every placeholder', () => {
    const mismatched = [...english]
      .filter(([key, text]) => {
        const translated = translations.get(key);
        return (
          translated !== undefined && placeholders(translated).join() !== placeholders(text).join()
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});

describe('English source', () => {
  it('has no empty strings', () => {
    expect([...english.values()].filter((text) => text.trim() === '')).toEqual([]);
  });
});
