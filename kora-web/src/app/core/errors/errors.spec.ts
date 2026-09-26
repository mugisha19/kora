import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { provideTestI18n } from '../../../testing/test-providers';
import { ApiError } from '../api/api-error';
import { provideApi } from '../http/api.providers';
import { Notifier } from '../notify/notifier';
import { NOW } from '../session/clock';
import { ErrorMessages } from './error-messages';
import { GlobalErrorHandler } from './global-error-handler';
import { serverErrors } from './server-errors';

function apiError(overrides: Partial<ApiError>): ApiError {
  return { status: 400, code: 'validation.failed', fieldErrors: [], ...overrides };
}

describe('error handling', () => {
  describe('ErrorMessages', () => {
    let messages: ErrorMessages;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideTestI18n()] });
      messages = TestBed.inject(ErrorMessages);
    });

    it('translates by code, then by status, then generically', () => {
      expect(messages.message(apiError({ status: 409, code: 'members.last_admin' }))).toBe(
        'The organization needs at least one administrator.',
      );
      expect(messages.message(apiError({ status: 412, code: 'some.future_code' }))).toBe(
        'Someone else saved changes first. Reload to see them, then try again.',
      );
      expect(messages.message(apiError({ status: 418, code: 'http.418' }))).toBe(
        'Something went wrong. Please try again.',
      );
    });

    it('fills in Retry-After, defaulting to a minute', () => {
      expect(
        messages.message(apiError({ status: 429, code: 'rate_limited', retryAfter: 12 })),
      ).toBe('Too many attempts. Wait 12 seconds and try again.');
      expect(messages.message(apiError({ status: 429, code: 'rate_limited' }))).toContain(
        '60 seconds',
      );
    });

    it('translates field errors by code and params, choosing the right variant', () => {
      const field = (code: string, params?: Record<string, unknown>) =>
        messages.fieldMessage({ field: 'x', code, params });

      expect(field('required')).toBe('This field is required.');
      expect(field('length', { min: 12, max: 128 })).toBe('Must be between 12 and 128 characters.');
      expect(field('length', { min: 2 })).toBe('Must be at least 2 characters.');
      expect(field('length', { max: 100 })).toBe('Must be at most 100 characters.');
      expect(field('range', { min: 0 })).toBe('Must be at least 0.');
      expect(field('invalid', { allowed: ['email', 'fullName'] })).toBe(
        'Must be one of: email, fullName.',
      );
      expect(field('password.breached')).toContain('data breach');
      // A domain code used as a field error falls back to the code's message.
      expect(field('invitations.already_member')).toBe('This person is already a member.');
      expect(field('brand.new')).toBe("This value isn't valid.");
    });

    it('follows the active language', () => {
      TestBed.inject(TranslocoService).setActiveLang('fr');

      expect(messages.fieldMessage({ field: 'email', code: 'email' })).toBe(
        'Saisissez une adresse e-mail valide.',
      );
    });
  });

  describe('serverErrors', () => {
    const translate = (e: { code: string }) => `msg:${e.code}`;

    function aForm() {
      return TestBed.runInInjectionContext(() =>
        form(signal({ email: '', password: '', objectives: [{ metric: '' }, { metric: '' }] })),
      );
    }

    it('puts each message on the field it names, including nested array paths', () => {
      TestBed.configureTestingModule({});
      const f = aForm();

      const errors = serverErrors(
        f,
        apiError({
          fieldErrors: [
            { field: 'email', code: 'email' },
            { field: 'objectives[1].metric', code: 'required' },
          ],
        }),
        translate,
      );

      expect(errors).toEqual([
        { kind: 'server', message: 'msg:email', fieldTree: f.email },
        { kind: 'server', message: 'msg:required', fieldTree: f.objectives[1].metric },
      ]);
    });

    it('turns unknown fields into form-level errors', () => {
      TestBed.configureTestingModule({});
      const f = aForm();

      expect(
        serverErrors(f, apiError({ fieldErrors: [{ field: 'body', code: 'invalid' }] }), translate),
      ).toEqual([{ kind: 'server', message: 'msg:invalid' }]);
      expect(
        serverErrors(
          f,
          apiError({ fieldErrors: [{ field: 'objectives[9].metric', code: 'x' }] }),
          translate,
        ),
      ).toEqual([{ kind: 'server', message: 'msg:x' }]);
    });

    it('without field details returns the form message, or nothing', () => {
      TestBed.configureTestingModule({});
      const f = aForm();
      const conflict = apiError({ status: 409, code: 'auth.email_taken' });

      expect(serverErrors(f, conflict, translate, (e) => `form:${e.code}`)).toEqual([
        { kind: 'server', message: 'form:auth.email_taken' },
      ]);
      expect(serverErrors(f, conflict, translate)).toEqual([]);
    });
  });

  describe('Notifier', () => {
    it('keeps errors until dismissed and lets confirmations time out', () => {
      const open = vi.fn();
      TestBed.configureTestingModule({
        providers: [provideTestI18n(), { provide: MatSnackBar, useValue: { open } }],
      });
      const notifier = TestBed.inject(Notifier);

      notifier.error('Could not save.', 'abc');
      notifier.error('Offline.');
      notifier.success('Saved.');

      expect(open).toHaveBeenNthCalledWith(1, 'Could not save. (Ref. abc)', 'Dismiss', {
        politeness: 'assertive',
        panelClass: 'kora-snackbar-error',
      });
      expect(open.mock.calls[1][0]).toBe('Offline.');
      expect(open).toHaveBeenNthCalledWith(3, 'Saved.', 'Dismiss', {
        duration: 5000,
        politeness: 'polite',
      });
    });
  });

  describe('GlobalErrorHandler', () => {
    let now: number;
    let notifier: { error: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      now = 0;
      notifier = { error: vi.fn() };
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      TestBed.configureTestingModule({
        providers: [
          provideTestI18n(),
          provideApi(),
          { provide: Notifier, useValue: notifier },
          { provide: NOW, useValue: () => now },
        ],
      });
    });

    afterEach(() => vi.restoreAllMocks());

    it('is the app error handler, logs everything and toasts unexpected errors once per window', () => {
      const handler = TestBed.inject(ErrorHandler);
      expect(handler).toBeInstanceOf(GlobalErrorHandler);

      handler.handleError(new Error('boom'));
      handler.handleError(new Error('boom again'));
      now += 6000;
      handler.handleError(new Error('later'));

      expect(console.error).toHaveBeenCalledTimes(3);
      expect(notifier.error).toHaveBeenCalledTimes(2);
      expect(notifier.error).toHaveBeenCalledWith(
        'Something unexpected happened. If it keeps happening, reload the page.',
      );
    });

    it('leaves HTTP errors to the interceptor and screens', () => {
      const handler = TestBed.inject(ErrorHandler);

      handler.handleError(new HttpErrorResponse({ status: 500 }));
      handler.handleError(apiError({ status: 409 }));

      expect(notifier.error).not.toHaveBeenCalled();
    });
  });
});
