import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QueryParams, intParam, oneOfParam } from './query-params';

@Component({ template: '', providers: [QueryParams] })
class ListPage {
  readonly query = inject(QueryParams);
}

describe('query params', () => {
  it('parses integers and known values, falling back otherwise', () => {
    expect(intParam('3', 0)).toBe(3);
    expect(intParam('-1', 0)).toBe(0);
    expect(intParam('abc', 5)).toBe(5);
    expect(intParam(undefined, 7)).toBe(7);
    expect(intParam('500', 0, 100)).toBe(100);
    expect(oneOfParam('RED', ['RED', 'GREEN'] as const)).toBe('RED');
    expect(oneOfParam('BLUE', ['RED', 'GREEN'] as const)).toBeNull();
  });

  it('merges changes into the URL and drops empty values', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'projects', component: ListPage }])],
    });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('projects?status=ON_HOLD&page=2', ListPage);

    await page.query.set({ q: 'mobile', page: null });
    expect(TestBed.inject(Router).url).toBe('/projects?status=ON_HOLD&q=mobile');

    await page.query.set({ q: '', status: 'CLOSED' });
    expect(TestBed.inject(Router).url).toBe('/projects?status=CLOSED');
  });
});
