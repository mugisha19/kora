import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideMockApi } from '../../testing/mock-api';
import { provideTestUi } from '../../testing/test-providers';
import { LanguageService } from '../core/i18n/language.service';
import { ThemeService } from '../core/theme/theme.service';
import { DashboardPage } from './dashboard/dashboard-page';
import { NotFoundPage } from './not-found/not-found-page';
import { SettingsPage } from './settings/settings-page';

describe('pages', () => {
  const providers = [...provideTestUi(), ...provideMockApi(), provideRouter([])];

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('dashboard explains what will appear', async () => {
    await render(DashboardPage, { providers });

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Your portfolio overview will appear here' }),
    ).toBeTruthy();
  });

  it('not-found links back to the dashboard', async () => {
    await render(NotFoundPage, { providers });

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the dashboard' }).getAttribute('href')).toBe(
      '/dashboard',
    );
  });

  describe('settings', () => {
    it('switches theme and language from labelled segmented controls', async () => {
      await render(SettingsPage, { providers });

      const theme = screen.getByRole('radiogroup', { name: 'Theme' });
      await userEvent.click(within(theme).getByRole('radio', { name: /Dark/ }));
      expect(TestBed.inject(ThemeService).mode()).toBe('dark');

      const language = screen.getByRole('radiogroup', { name: 'Language' });
      await userEvent.click(within(language).getByRole('radio', { name: 'Ikinyarwanda' }));
      expect(TestBed.inject(LanguageService).current()).toBe('rw');
      expect(await screen.findByRole('heading', { level: 1, name: 'Igenamiterere' })).toBeTruthy();
    });

    it('shows versions and flags mock mode', async () => {
      await render(SettingsPage, { providers });

      expect(screen.getByText('Web app version')).toBeTruthy();
      expect(screen.getByText('0.1.0')).toBeTruthy();
      expect(screen.getByText('0.1.1')).toBeTruthy();
      // Unit tests build with the production environment file (live API).
      expect(screen.getByText('Live API')).toBeTruthy();
    });
  });
});
