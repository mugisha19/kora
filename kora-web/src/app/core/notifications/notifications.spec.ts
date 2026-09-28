import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  mockSession,
  provideMockApi,
  provideSession,
  resetMockApi,
} from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { broker } from '../../mocks/broker';
import { ORG_AKAGERA, USER } from '../../mocks/data';
import { db } from '../../mocks/db';
import { notify } from '../../mocks/outbox';
import { AppNotification } from '../api/api.models';
import { NotificationsButton } from '../layout/notifications-button';
import { LiveUpdates, OFFLINE_GRACE_MS } from '../live/live-updates';
import { NotificationText } from './notification-text';

async function renderBell(email = 'member@kora.demo') {
  const view = await render(NotificationsButton, {
    providers: [
      ...provideTestUi(),
      ...provideMockApi(),
      provideRouter([]),
      provideSession(await mockSession(email)),
    ],
  });
  const bell = await screen.findByRole(
    'button',
    { name: /^Notifications: \d+ unread$/ },
    { timeout: 5000 },
  );
  return { view, bell };
}

const sheet = () => screen.findByRole('dialog', { name: 'Notifications' });

describe('notifications', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => {
    broker.setOnline(true);
    localStorage.clear();
  });

  it('counts unread notifications on the bell and lists them by day', async () => {
    const { bell } = await renderBell();
    expect(bell.getAttribute('aria-label')).toBe('Notifications: 2 unread');

    await userEvent.click(bell);
    const dialog = await sheet();
    expect(within(dialog).getByText('Unread: 2')).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Today' })).toBeTruthy();
    const link = within(dialog).getByRole('link', {
      name: 'Grace Mukamana assigned you AKG-001-49 · Biometric sign-in on Android',
    });
    expect(link.getAttribute('href')).toMatch(/^\/projects\/.+\/tasks\/.+$/);
    expect(within(dialog).getByText(/The review of AKG-001-R5 · .+ was due/)).toBeTruthy();
    expect(within(dialog).getAllByText('Unread')).toHaveLength(2);
  });

  it('marks one as read, then all', async () => {
    const { bell } = await renderBell();
    await userEvent.click(bell);
    const dialog = await sheet();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /^Mark as read: Grace Mukamana assigned you/ }),
    );
    await waitFor(() => expect(bell.getAttribute('aria-label')).toBe('Notifications: 1 unread'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(bell.getAttribute('aria-label')).toBe('Notifications'));
    // Wait for the request too: a late one would mark the next test's data read.
    await waitFor(() =>
      expect(db.state.notifications.filter((n) => n.userId === USER.member && !n.readAt)).toEqual(
        [],
      ),
    );
  });

  it('adds a notification that arrives live and announces it politely', async () => {
    const announce = vi.spyOn(LiveAnnouncer.prototype, 'announce').mockResolvedValue();
    const { bell } = await renderBell();
    await waitFor(() => expect(TestBed.inject(LiveUpdates).state()).toBe('online'));

    notify(
      USER.member,
      ORG_AKAGERA,
      'REPORT_READY',
      {
        reportId: crypto.randomUUID(),
        type: 'EVM',
        format: 'PDF',
        fileName: 'earned-value.pdf',
      },
      '/reports',
    );

    await waitFor(() => expect(bell.getAttribute('aria-label')).toBe('Notifications: 3 unread'));
    expect(announce).toHaveBeenCalledWith(
      'Your earned value report (PDF) is ready to download',
      'polite',
    );
    announce.mockRestore();
  });

  it('catches up after the connection comes back', async () => {
    const { bell } = await renderBell();
    const live = TestBed.inject(LiveUpdates);
    await waitFor(() => expect(live.state()).toBe('online'));

    broker.setOnline(false);
    expect(live.state()).toBe('offline');
    // Missed while offline: only a reload finds it.
    notify(USER.member, ORG_AKAGERA, 'ISSUE_ESCALATED', { key: 'AKG-001-I1', title: 'X' });
    broker.setOnline(true);

    await waitFor(() => expect(live.state()).toBe('online'));
    await waitFor(() => expect(bell.getAttribute('aria-label')).toBe('Notifications: 3 unread'));
  });

  it('shows the offline state only after a grace period', async () => {
    await renderBell();
    const live = TestBed.inject(LiveUpdates);
    await waitFor(() => expect(live.state()).toBe('online'));
    vi.useFakeTimers();
    try {
      broker.setOnline(false);
      expect(live.offline()).toBe(false);
      vi.advanceTimersByTime(OFFLINE_GRACE_MS + 10);
      expect(live.offline()).toBe(true);
      broker.setOnline(true);
      expect(live.offline()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never receives another person’s notifications', async () => {
    const { bell } = await renderBell();
    await waitFor(() => expect(TestBed.inject(LiveUpdates).state()).toBe('online'));
    notify(USER.pm, ORG_AKAGERA, 'TASK_ASSIGNED', {
      key: 'AKG-001-1',
      title: 'X',
      actorId: USER.pmo,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bell.getAttribute('aria-label')).toBe('Notifications: 2 unread');
  });
});

describe('NotificationText', () => {
  beforeEach(() => resetMockApi());

  /** A formatter for one notification; names load with the organization's people. */
  const text = async (n: Partial<AppNotification>) => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTestUi(),
        ...provideMockApi(),
        provideSession(await mockSession('pm@kora.demo')),
      ],
    });
    const formatter = TestBed.inject(NotificationText);
    return () =>
      formatter.describe({
        id: 'n',
        createdAt: new Date().toISOString(),
        params: {},
        type: 'TASK_ASSIGNED',
        titleKey: 'notifications.task_assigned',
        ...n,
      } as AppNotification);
  };

  it('picks the approved, rejected and commented wording', async () => {
    const decided = await text({
      type: 'TIMESHEET_DECIDED',
      titleKey: 'notifications.timesheet_decided',
      params: { week: '2026-W39', approved: false, comment: 'Split Tuesday.', actorId: USER.pm },
    });
    await waitFor(() => expect(decided()).toContain('Grace Mukamana'));
    expect(decided()).toBe('Grace Mukamana sent back your time for week 39: “Split Tuesday.”');
  });

  it('says something useful for a kind it does not know', async () => {
    const unknown = await text({
      type: 'TASK_ASSIGNED',
      titleKey: 'notifications.something_new',
    });
    expect(unknown()).toBe('Something needs your attention.');
  });
});
