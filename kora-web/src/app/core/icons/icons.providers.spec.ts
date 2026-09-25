import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { provideIcons } from './icons.providers';

describe('provideIcons', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideIcons()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
  });

  it('resolves a named icon to the self-hosted SVG file', async () => {
    const icon = firstValueFrom(TestBed.inject(MatIconRegistry).getNamedSvgIcon('menu'));

    TestBed.inject(HttpTestingController)
      .expectOne('icons/menu.svg')
      .flush('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');

    expect((await icon).tagName.toLowerCase()).toBe('svg');
  });

  it('leaves namespaced icons to other resolvers', async () => {
    const icon = firstValueFrom(TestBed.inject(MatIconRegistry).getNamedSvgIcon('logo', 'brand'));

    await expect(icon).rejects.toThrow(/Unable to find icon/);
  });
});
