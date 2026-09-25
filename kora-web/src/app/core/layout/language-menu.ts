import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { take } from 'rxjs';
import { Locale } from '../api/api.models';
import { LANGUAGE_NAMES, LanguageService } from '../i18n/language.service';

/**
 * Toolbar language switcher. Each option carries its own `lang` so screen readers pronounce
 * "Français" and "Ikinyarwanda" correctly whatever the current UI language is.
 */
@Component({
  selector: 'kora-language-menu',
  imports: [
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    TranslocoPipe,
  ],
  template: `
    <button
      mat-icon-button
      type="button"
      [matMenuTriggerFor]="menu"
      [matTooltip]="'language.label' | transloco"
      [attr.aria-label]="'language.change' | transloco: { name: names[language.current()] }"
    >
      <mat-icon svgIcon="translate" aria-hidden="true" />
    </button>
    <mat-menu #menu="matMenu">
      @for (locale of language.available; track locale) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.lang]="locale"
          [attr.aria-checked]="language.current() === locale"
          (click)="select(locale)"
        >
          <span>{{ names[locale] }}</span>
          @if (language.current() === locale) {
            <mat-icon class="check" svgIcon="check" aria-hidden="true" />
          }
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .check {
      margin-inline: var(--kora-space-4) 0;
    }
  `,
})
export class LanguageMenu {
  protected readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly names = LANGUAGE_NAMES;

  protected select(locale: Locale): void {
    this.language.choose(locale);
    // Announce in the new language, once its file has loaded.
    this.transloco
      .selectTranslate<string>('language.changed', { name: LANGUAGE_NAMES[locale] }, locale)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => void this.announcer.announce(message, 'polite'));
  }
}
