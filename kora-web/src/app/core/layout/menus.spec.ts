import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestUi } from '../../../testing/test-providers';
import { LanguageService } from '../i18n/language.service';
import { ThemeService } from '../theme/theme.service';
import { LanguageMenu } from './language-menu';
import { ThemeMenu } from './theme-menu';

describe('toolbar menus', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  describe('ThemeMenu', () => {
    it('names the current theme, lists the choices as radio items and announces a change', async () => {
      const announce = vi.spyOn(LiveAnnouncer.prototype, 'announce').mockResolvedValue();
      await render(ThemeMenu, { providers: provideTestUi() });

      await userEvent.click(screen.getByRole('button', { name: 'Change theme (current: System)' }));
      const dark = await screen.findByRole('menuitemradio', { name: 'Dark' });
      expect(
        screen.getByRole('menuitemradio', { name: 'System' }).getAttribute('aria-checked'),
      ).toBe('true');

      await userEvent.click(dark);

      expect(TestBed.inject(ThemeService).mode()).toBe('dark');
      expect(announce).toHaveBeenCalledWith('Theme set to Dark', 'polite');
      expect(screen.getByRole('button', { name: 'Change theme (current: Dark)' })).toBeTruthy();
    });
  });

  describe('LanguageMenu', () => {
    it('lists each language in its own language and switches, announcing in the new language', async () => {
      const announce = vi.spyOn(LiveAnnouncer.prototype, 'announce').mockResolvedValue();
      await render(LanguageMenu, { providers: provideTestUi() });

      await userEvent.click(
        screen.getByRole('button', { name: 'Change language (current: English)' }),
      );
      const french = await screen.findByRole('menuitemradio', { name: 'Français' });
      expect(french.getAttribute('lang')).toBe('fr');

      await userEvent.click(french);

      expect(TestBed.inject(LanguageService).current()).toBe('fr');
      expect(announce).toHaveBeenCalledWith('Langue changée en Français', 'polite');
      expect(
        await screen.findByRole('button', { name: 'Changer de langue (actuelle : Français)' }),
      ).toBeTruthy();
    });
  });
});
