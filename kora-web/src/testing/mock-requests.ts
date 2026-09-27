import { getResponse } from 'msw';
import { DEMO_PASSWORD, ORG_AKAGERA } from '../app/mocks/data';
import { handlers } from '../app/mocks/handlers';

/** Raw requests straight through the MSW handlers (no service worker, no Angular), for mock-API specs. */
const BASE = 'http://localhost/api/v1';

export async function call(
  method: string,
  path: string,
  { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await getResponse(
    handlers,
    new Request(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  if (!response) throw new Error(`No handler for ${method} ${path}`);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? (JSON.parse(text) as Record<string, any>) : null, // eslint-disable-line @typescript-eslint/no-explicit-any -- test-only: bodies are asserted structurally
  };
}

export async function signIn(email = 'admin@kora.demo') {
  const res = await call('POST', '/auth/login', { body: { email, password: DEMO_PASSWORD } });
  if (!res.body) throw new Error(`Sign-in failed for ${email}: ${res.status}`);
  const token = String(res.body['accessToken']);
  return {
    token,
    cookie: String(res.headers.get('Set-Cookie')).split(';')[0],
    headers: (org = ORG_AKAGERA) => ({
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': org,
    }),
  };
}
