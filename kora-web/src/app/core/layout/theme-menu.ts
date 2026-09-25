import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { THEME_ICONS, THEME_MODES, ThemeMode, ThemeService } from '../theme/theme.service';

/** Toolbar shortcut for light / dark / system; the current choice is a checked radio item. */
@Component({
  selector: 'kora-theme-menu',
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
      [matTooltip]="'theme.label' | transloco"
      [attr.aria-label]="
        'theme.change' | transloco: { name: ('theme.' + theme.mode() | transloco) }
      "
    >
      <mat-icon [svgIcon]="icons[theme.mode()]" aria-hidden="true" />
    </button>
    <mat-menu #menu="matMenu">
      @for (mode of modes; track mode) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="theme.mode() === mode"
          (click)="select(mode)"
        >
          <mat-icon [svgIcon]="icons[mode]" aria-hidden="true" />
          <span>{{ 'theme.' + mode | transloco }}</span>
          @if (theme.mode() === mode) {
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
export class ThemeMenu {
  protected readonly theme = inject(ThemeService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly transloco = inject(TranslocoService);
  protected readonly modes = THEME_MODES;
  protected readonly icons = THEME_ICONS;

  protected select(mode: ThemeMode): void {
    this.theme.setMode(mode);
    const name = this.transloco.translate(`theme.${mode}`);
    void this.announcer.announce(this.transloco.translate('theme.changed', { name }), 'polite');
  }
}
