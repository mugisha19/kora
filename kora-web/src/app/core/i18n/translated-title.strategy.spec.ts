import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { provideTestI18n } from '../../../testing/test-providers';
import { TranslatedTitleStrategy } from './translated-title.strategy';

@Component({ template: '' })
class Blank {}

describe('TranslatedTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTestI18n(),
        provideRouter([
          { path: 'settings', title: 'nav.settings', component: Blank },
          { path: 'untitled', component: Blank },
        ]),
        { provide: TitleStrategy, useExisting: TranslatedTitleStrategy },
      ],
    });
  });

  it('translates the route title and appends the product name', async () => {
    await TestBed.inject(Router).navigateByUrl('/settings');

    expect(TestBed.inject(Title).getTitle()).toBe('Settings · Kora');
  });

  it('re-translates the current title when the language changes', async () => {
    await TestBed.inject(Router).navigateByUrl('/settings');

    TestBed.inject(TranslocoService).setActiveLang('fr');

    expect(TestBed.inject(Title).getTitle()).toBe('Paramètres · Kora');
  });

  it('shows only the product name for routes without a title', async () => {
    await TestBed.inject(Router).navigateByUrl('/untitled');

    expect(TestBed.inject(Title).getTitle()).toBe('Kora');
  });
});
