import { Component, ElementRef, Injector, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FormField,
  email,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  validate,
} from '@angular/forms/signals';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslocoService } from '@jsverse/transloco';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestUi } from '../../../testing/test-providers';
import { ApiError } from '../../core/api/api-error';
import { ErrorMessages } from '../../core/errors/error-messages';
import { FieldError, I18N_ERROR } from './field-error';
import { submitWithApi } from './form-helpers';
import { LocalizedDatePipe } from './localized-date.pipe';
import { PasswordToggle } from './password-toggle';

@Component({
  selector: 'kora-test-form',
  imports: [FieldError, FormField, MatError, MatFormField, MatInput, MatLabel],
  template: `
    @if (formError()) {
      <p role="alert">{{ formError() }}</p>
    }
    <form novalidate (submit)="save($event)">
      <mat-form-field>
        <mat-label>Name</mat-label>
        <input matInput [formField]="form.name" />
        <mat-error><kora-field-error [field]="form.name" /></mat-error>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Email</mat-label>
        <input matInput [formField]="form.email" />
        <mat-error><kora-field-error [field]="form.email" /></mat-error>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Code</mat-label>
        <input matInput [formField]="form.code" />
        <mat-error><kora-field-error [field]="form.code" /></mat-error>
      </mat-form-field>
      <button type="submit">Save</button>
    </form>
  `,
})
class TestForm {
  readonly model = signal({ name: '', email: '', code: 'AB' });
  readonly form = form(this.model, (path) => {
    required(path.name);
    minLength(path.name, 3);
    maxLength(path.name, 5);
    email(path.email);
    pattern(path.code, /^[A-Z]{3}$/);
    validate(path.code, ({ value }) =>
      value() === 'BAD' ? { kind: I18N_ERROR, message: 'auth.reset.mismatch' } : undefined,
    );
  });
  readonly formError = signal<string | null>(null);
  action: () => Promise<unknown> = () => Promise.resolve();
  handle?: (error: ApiError) => boolean;
  result: boolean | undefined;

  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  async save(event: Event): Promise<void> {
    event.preventDefault();
    this.result = await submitWithApi(this.form, this.context, () => this.action(), this.handle);
  }
}

function apiError(overrides: Partial<ApiError>): ApiError {
  return { status: 400, code: 'validation.failed', fieldErrors: [], ...overrides };
}

describe('form building blocks', () => {
  async function setup() {
    const view = await render(TestForm, { providers: provideTestUi() });
    return { view, component: view.fixture.componentInstance };
  }

  it('shows translated client-side errors after submit and focuses the first invalid field', async () => {
    const { component } = await setup();
    const action = vi.fn().mockResolvedValue(undefined);
    component.action = action;

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(action).not.toHaveBeenCalled();
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(screen.getByText("The format isn't valid.")).toBeTruthy();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })),
    );
  });

  it('translates length, email and custom errors, and follows the language', async () => {
    const { component, view } = await setup();
    component.model.set({ name: 'ab', email: 'nope', code: 'BAD' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Must be at least 3 characters.')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();

    component.model.set({ name: 'abcdefg', email: 'a@b.co', code: 'BAD' });
    TestBed.inject(TranslocoService).setActiveLang('fr');
    view.fixture.detectChanges();
    expect(await screen.findByText('Doit contenir au plus 5 caractères.')).toBeTruthy();
    expect(screen.getByText('Les mots de passe ne correspondent pas.')).toBeTruthy();
  });

  it('puts API field errors on their fields and resolves false', async () => {
    const { component } = await setup();
    component.model.set({ name: 'Aline', email: 'a@b.co', code: 'ABC' });
    component.action = () =>
      Promise.reject(
        apiError({
          status: 409,
          code: 'auth.email_taken',
          fieldErrors: [{ field: 'email', code: 'auth.email_taken' }],
        }),
      );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(component.result).toBe(false);
  });

  it('shows errors without a matching field above the form', async () => {
    const { component } = await setup();
    component.model.set({ name: 'Aline', email: 'a@b.co', code: 'ABC' });
    component.action = () =>
      Promise.reject(apiError({ status: 401, code: 'auth.invalid_credentials' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect.');

    component.action = () =>
      Promise.reject(apiError({ fieldErrors: [{ field: 'body', code: 'required' }] }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This field is required.');
  });

  it('lets the caller handle specific errors, and resolves true on success', async () => {
    const { component } = await setup();
    component.model.set({ name: 'Aline', email: 'a@b.co', code: 'ABC' });
    component.handle = (error) => error.status === 412;
    component.action = () =>
      Promise.reject(apiError({ status: 412, code: 'concurrency.stale_version' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(component.result).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();

    component.action = () => Promise.resolve();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(component.result).toBe(true));
  });

  it('PasswordToggle is a pressed/unpressed toggle with a constant label', async () => {
    const visible = signal(false);
    await render(`<kora-password-toggle [(visible)]="visible" />`, {
      imports: [PasswordToggle],
      componentProperties: { visible },
      providers: provideTestUi(),
    });
    const button = screen.getByRole('button', { name: 'Show password' });

    expect(button.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(button);
    expect(visible()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('LocalizedDatePipe formats in the given language and ignores bad input', () => {
    const pipe = new LocalizedDatePipe();

    expect(pipe.transform('2026-03-05T10:00:00Z', 'en', 'long')).toBe('March 5, 2026');
    expect(pipe.transform('2026-03-05T10:00:00Z', 'fr', 'long')).toBe('5 mars 2026');
    expect(pipe.transform('not a date', 'en')).toBe('');
    expect(pipe.transform(null, 'en')).toBe('');
  });
});
