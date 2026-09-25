import { PREFERENCE_KEYS, readPreference, writePreference } from './preferences';

describe('preferences', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('writes, reads and removes a value', () => {
    writePreference(PREFERENCE_KEYS.theme, 'dark');
    expect(readPreference(PREFERENCE_KEYS.theme)).toBe('dark');

    writePreference(PREFERENCE_KEYS.theme, null);
    expect(readPreference(PREFERENCE_KEYS.theme)).toBeNull();
  });

  it('treats unreadable storage as "no stored value"', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(readPreference(PREFERENCE_KEYS.language)).toBeNull();
  });

  it('ignores storage that refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(() => writePreference(PREFERENCE_KEYS.language, 'fr')).not.toThrow();
  });
});
