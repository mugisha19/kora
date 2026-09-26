import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  mockSession,
  provideMockApi,
  provideSession,
  resetMockApi,
} from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { LanguageService } from '../../core/i18n/language.service';
import { SessionStore } from '../../core/session/session.store';
import { db } from '../../mocks/db';
import { ProfileCard } from './profile-card';

describe('ProfileCard', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  async function setup() {
    return render(ProfileCard, {
      providers: [
        ...provideTestUi(),
        ...provideMockApi(),
        provideSession(await mockSession('pm@kora.demo')),
      ],
    });
  }

  it('saves name and language to the account and switches this device to the language', async () => {
    await setup();
    const name = screen.getByRole('textbox', { name: /Full name/ });
    expect((name as HTMLInputElement).value).toBe('Grace Mukamana');
    expect(screen.getByRole('button', { name: 'Save profile' }).hasAttribute('disabled')).toBe(
      true,
    );

    await userEvent.clear(name);
    await userEvent.type(name, 'Grace M.');
    await userEvent.click(screen.getByRole('combobox', { name: 'Preferred language' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Français' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    // The success message arrives in the newly chosen language.
    expect(await screen.findByText('Profil enregistré.')).toBeTruthy();
    expect(db.userByEmail('pm@kora.demo')).toMatchObject({ fullName: 'Grace M.', locale: 'fr' });
    expect(TestBed.inject(SessionStore).user()?.fullName).toBe('Grace M.');
    expect(TestBed.inject(LanguageService).current()).toBe('fr');
  });

  it('requires a name', async () => {
    await setup();

    await userEvent.clear(screen.getByRole('textbox', { name: /Full name/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('This field is required.')).toBeTruthy();
  });
});
