import {
  HttpBackend,
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  EnvironmentProviders,
  Injectable,
  Provider,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { getResponse } from 'msw';
import { Observable, firstValueFrom } from 'rxjs';
import { SessionResponse } from '../app/core/api/api.models';
import { AuthApi } from '../app/core/api/auth.api';
import { API_INTERCEPTORS, RETRY_POLICY } from '../app/core/http/interceptors';
import { REFRESH_RETRY_DELAY_MS } from '../app/core/session/session-refresher';
import { SessionStore } from '../app/core/session/session.store';
import { DEMO_PASSWORD } from '../app/mocks/data';
import { db } from '../app/mocks/db';
import { handlers } from '../app/mocks/handlers';
import { setMockLatency } from '../app/mocks/http';

// Unit tests answer instantly: chained requests with simulated latency race the tests' waits.
setMockLatency(0);

/**
 * An HttpBackend that answers from the MSW mock API in-process: requests go through the real
 * interceptor chain and hit handlers that enforce the contract (validation, tenancy, If-Match…),
 * so component tests exercise real behaviour without a service worker. A small cookie jar stands in
 * for the browser's, so the refresh cookie works like in the app.
 */
@Injectable()
export class MockApiBackend implements HttpBackend {
  private readonly cookies = new Map<string, string>();

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    return new Observable<HttpEvent<unknown>>((observer) => {
      let cancelled = false;
      this.send(req).then(
        (result) => {
          if (cancelled) return;
          if (result instanceof HttpErrorResponse) {
            observer.error(result);
          } else {
            observer.next({ type: HttpEventType.Sent });
            observer.next(result);
            observer.complete();
          }
        },
        (error: unknown) => observer.error(error),
      );
      return () => {
        cancelled = true;
      };
    });
  }

  private async send(
    req: HttpRequest<unknown>,
  ): Promise<HttpResponse<unknown> | HttpErrorResponse> {
    const headers = new Headers();
    for (const key of req.headers.keys()) headers.set(key, req.headers.get(key) ?? '');
    if (this.cookies.size) {
      headers.set(
        'Cookie',
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }
    const hasBody = req.body !== null && req.body !== undefined;
    if (hasBody) headers.set('Content-Type', 'application/json');

    const request = new Request(new URL(req.urlWithParams, 'http://localhost'), {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });
    const response = await getResponse(handlers, request);
    if (!response) {
      return new HttpErrorResponse({ status: 404, statusText: 'No mock', url: req.url });
    }

    this.storeCookies(response.headers.get('Set-Cookie'));
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    let responseHeaders = new HttpHeaders();
    response.headers.forEach((value, key) => (responseHeaders = responseHeaders.set(key, value)));
    const init = {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      url: req.url,
    };
    return response.ok
      ? new HttpResponse({ ...init, body })
      : new HttpErrorResponse({ ...init, error: body });
  }

  private storeCookies(header: string | null): void {
    if (!header) return;
    const [pair, ...attributes] = header.split(';');
    const [name, value] = pair.split('=');
    const expired = attributes.some((a) => a.trim().toLowerCase() === 'max-age=0');
    if (expired || !value) this.cookies.delete(name.trim());
    else this.cookies.set(name.trim(), value.trim());
  }
}

/** HttpClient + the app's interceptor chain, answered by the mock API; no waiting on retries. */
export function provideMockApi(): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withInterceptors(API_INTERCEPTORS)),
    { provide: HttpBackend, useClass: MockApiBackend },
    { provide: REFRESH_RETRY_DELAY_MS, useValue: 0 },
    { provide: RETRY_POLICY, useValue: { maxRetries: 0, baseDelayMs: 0, maxRetryAfterSeconds: 0 } },
  ];
}

/** Fresh demo data (call in `beforeEach`). */
export function resetMockApi(): void {
  db.reset();
}

/**
 * A signed-in session for a demo user, straight from the mock handlers (no Angular involved), for
 * `provideSession()` in tests that render a component which loads data as soon as it starts.
 */
export async function mockSession(email: string): Promise<SessionResponse> {
  const response = await getResponse(
    handlers,
    new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    }),
  );
  if (!response?.ok) throw new Error(`Mock sign-in failed for ${email}`);
  return (await response.json()) as SessionResponse;
}

/** Starts `session` while the test injector is created, before any component runs. */
export function provideSession(session: SessionResponse): EnvironmentProviders {
  return provideEnvironmentInitializer(() => inject(SessionStore).start(session));
}

/** Signs in a demo user through the mock API and starts the session (no navigation). */
export async function signInAs(email: string): Promise<void> {
  const session = await firstValueFrom(
    TestBed.inject(AuthApi).login({ email, password: DEMO_PASSWORD }),
  );
  TestBed.inject(SessionStore).start(session);
}
