import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import en from '../../../../public/i18n/en.json';
import { provideI18n } from './i18n.providers';
import { TranslatedTitleStrategy } from './translated-title.strategy';

describe('provideI18n', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideI18n()],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads the start-up language over HTTP before the app initializes', async () => {
    const initialized = TestBed.inject(ApplicationInitStatus).donePromise;
    const http = TestBed.inject(HttpTestingController);

    http.expectOne('i18n/en.json').flush(en);
    await initialized;

    expect(TestBed.inject(TranslocoService).translate('nav.settings')).toBe('Settings');
    expect(TestBed.inject(TitleStrategy)).toBeInstanceOf(TranslatedTitleStrategy);
    http.verify();
  });
});
