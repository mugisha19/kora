import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TranslocoHttpLoader } from './transloco-http.loader';

describe('TranslocoHttpLoader', () => {
  it('fetches the language file relative to the app base href', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const translation = firstValueFrom(TestBed.inject(TranslocoHttpLoader).getTranslation('fr'));
    TestBed.inject(HttpTestingController)
      .expectOne('i18n/fr.json')
      .flush({ app: { name: 'Kora' } });

    expect(await translation).toEqual({ app: { name: 'Kora' } });
  });
});
