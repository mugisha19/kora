import { TestBed } from '@angular/core/testing';
import { PREFERENCE_KEYS } from '../storage/preferences';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  afterEach(() => {
    localStorage.clear();
    root.removeAttribute('data-theme');
  });

  function create(): ThemeService {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  it('follows the system by default', () => {
    const theme = create();

    expect(theme.mode()).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('applies and remembers an explicit choice', () => {
    const theme = create();

    theme.setMode('dark');
    TestBed.tick();

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(PREFERENCE_KEYS.theme)).toBe('dark');
  });

  it('forgets the choice when going back to system', () => {
    const theme = create();
    theme.setMode('light');
    TestBed.tick();

    theme.setMode('system');
    TestBed.tick();

    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(PREFERENCE_KEYS.theme)).toBeNull();
  });

  it('restores the stored choice and ignores invalid values', () => {
    localStorage.setItem(PREFERENCE_KEYS.theme, 'light');
    expect(create().mode()).toBe('light');

    TestBed.resetTestingModule();
    localStorage.setItem(PREFERENCE_KEYS.theme, 'sepia');
    expect(create().mode()).toBe('system');
  });
});
