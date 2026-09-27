import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { Routes, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { mockSession, provideMockApi, provideSession } from './mock-api';
import { provideTestUi } from './test-providers';

/**
 * Opens `url` in a router with `routes`, as a signed-in demo user, against the mock API: for pages
 * that live under a parent route (tabs, route-scoped stores, query parameters bound to inputs).
 * `@defer` blocks stay on their placeholder (jsdom can't tell what's in the viewport).
 */
export async function openRoute(routes: Routes, url: string, email: string) {
  TestBed.configureTestingModule({
    providers: [
      ...provideTestUi(),
      ...provideMockApi(),
      provideRouter(routes, withComponentInputBinding()),
      provideSession(await mockSession(email)),
    ],
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return harness;
}
