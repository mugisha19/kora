import { HttpContext, HttpRequest } from '@angular/common/http';
import {
  AUTH_REQUEST,
  SILENT_ERRORS,
  SKIP_LOADING,
  isApiRequest,
  isTenantFreePath,
  silent,
} from './http-context';

describe('http-context helpers', () => {
  it('recognizes requests to the Kora API by base path', () => {
    expect(isApiRequest(new HttpRequest('GET', '/api/v1/members'))).toBe(true);
    expect(isApiRequest(new HttpRequest('GET', '/i18n/en.json'))).toBe(false);
  });

  it('keeps the tenant header off auth, public invitation and /me calls', () => {
    expect(isTenantFreePath('/api/v1/auth/login')).toBe(true);
    expect(isTenantFreePath('/api/v1/invitations/token/abc')).toBe(true);
    expect(isTenantFreePath('/api/v1/me')).toBe(true);
    expect(isTenantFreePath('/api/v1/invitations')).toBe(false);
    expect(isTenantFreePath('/api/v1/organization')).toBe(false);
  });

  it('defaults every flag to off', () => {
    const context = new HttpContext();

    expect(context.get(SILENT_ERRORS)).toBe(false);
    expect(context.get(SKIP_LOADING)).toBe(false);
    expect(context.get(AUTH_REQUEST)).toBe(false);
  });

  it('marks a context as silent, reusing one if given', () => {
    const context = new HttpContext();

    expect(silent(context)).toBe(context);
    expect(context.get(SILENT_ERRORS)).toBe(true);
    expect(silent().get(SILENT_ERRORS)).toBe(true);
  });
});
