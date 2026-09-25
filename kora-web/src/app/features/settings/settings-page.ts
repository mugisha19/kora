import { Component, inject } from '@angular/core';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { Locale } from '../../core/api/api.models';
import { LANGUAGE_NAMES, LanguageService } from '../../core/i18n/language.service';
import { THEME_ICONS, THEME_MODES, ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusChip } from '../../shared/ui/status-chip';

/**
 * Settings (feature 23). Phase 1 has Appearance and About; the Profile card (name and saved
 * language on the account) arrives with sign-in in Phase 3.
 */
@Component({
  selector: 'kora-settings-page',
  imports: [
    MatButtonToggle,
    MatButtonToggleGroup,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatIcon,
    PageHeader,
    StatusChip,
    TranslocoPipe,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly themeModes = THEME_MODES;
  protected readonly themeIcons = THEME_ICONS;
  protected readonly languageNames = LANGUAGE_NAMES;
  protected readonly environment = environment;

  protected setTheme(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  protected setLanguage(locale: Locale): void {
    this.language.choose(locale);
  }
}
