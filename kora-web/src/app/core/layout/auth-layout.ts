import { Component, ElementRef, viewChild } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { focusHeadingOnNavigation, focusMainHeading } from './focus';
import { LanguageMenu } from './language-menu';
import { ThemeMenu } from './theme-menu';

/**
 * Frame for the public pages (sign-in, register, password reset, invitation links): brand, theme
 * and language only, and the page in a centred card. No navigation: there is nowhere to go yet.
 */
@Component({
  selector: 'kora-auth-layout',
  imports: [LanguageMenu, RouterLink, RouterOutlet, ThemeMenu, TranslocoPipe],
  template: `
    <a class="skip-link" href="#main" (click)="skipToMain($event)">{{
      'app.skipToContent' | transloco
    }}</a>
    <header class="bar">
      <a class="brand" routerLink="/login" [attr.aria-label]="'app.home' | transloco">
        <span class="logo" aria-hidden="true"></span>
        <span>Kora</span>
      </a>
      <span class="spacer"></span>
      <kora-language-menu />
      <kora-theme-menu />
    </header>
    <main #main id="main" class="main" tabindex="-1">
      <div class="card">
        <router-outlet />
      </div>
      <p class="tagline">{{ 'app.tagline' | transloco }}</p>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 100dvh;
      background: var(--mat-sys-surface-container-low);
    }
    .skip-link {
      position: absolute;
      inset-block-start: var(--kora-space-2);
      inset-inline-start: var(--kora-space-2);
      z-index: 10;
      padding: var(--kora-space-2) var(--kora-space-4);
      border-radius: var(--kora-radius);
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      transform: translateY(-200%);
    }
    .skip-link:focus {
      transform: none;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      padding: var(--kora-space-2) var(--kora-space-3);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--kora-space-2);
      color: inherit;
      text-decoration: none;
      font: var(--mat-sys-title-large);
    }
    /* The letter is drawn, not text: the link's visible text stays "Kora", matching its name. */
    .logo::before {
      content: 'K' / '';
    }
    .logo {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 8px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-weight: 700;
    }
    .spacer {
      flex: 1;
    }
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--kora-space-4) var(--kora-space-4) var(--kora-space-8);
      outline: none;
    }
    .card {
      box-sizing: border-box;
      inline-size: 100%;
      max-inline-size: 440px;
      padding: var(--kora-space-6);
      border-radius: var(--kora-radius);
      background: var(--mat-sys-surface);
      border: 1px solid var(--mat-sys-outline-variant);
    }
    .tagline {
      max-inline-size: 440px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    @media (max-width: 480px) {
      .card {
        padding: var(--kora-space-4);
      }
    }
  `,
})
export class AuthLayout {
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    focusHeadingOnNavigation(() => this.main().nativeElement);
  }

  protected skipToMain(event: Event): void {
    event.preventDefault();
    focusMainHeading(this.main().nativeElement);
  }
}
