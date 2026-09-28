import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  mockSession,
  provideMockApi,
  provideSession,
  resetMockApi,
} from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { USER } from '../../mocks/data';
import { db } from '../../mocks/db';
import { NotificationPreferencesCard } from './notification-preferences-card';

describe('notification settings', () => {
  beforeEach(() => resetMockApi());

  it('shows the defaults and saves only what changed', async () => {
    await render(NotificationPreferencesCard, {
      providers: [
        ...provideTestUi(),
        ...provideMockApi(),
        provideRouter([]),
        provideSession(await mockSession('member@kora.demo')),
      ],
    });
    const email = await screen.findByRole(
      'checkbox',
      { name: 'A task is assigned to me: by email' },
      { timeout: 5000 },
    );
    expect((email as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole('checkbox', { name: 'My report is ready: by email' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    const save = screen.getByRole('button', { name: 'Save notification settings' });
    expect(save.hasAttribute('disabled')).toBe(true);

    await userEvent.click(email);
    await userEvent.click(save);

    expect(await screen.findByText('Notification settings saved.')).toBeTruthy();
    await waitFor(() =>
      expect(db.state.notificationPreferences).toEqual([
        { userId: USER.member, type: 'TASK_ASSIGNED', inApp: true, email: false },
      ]),
    );
  });
});
