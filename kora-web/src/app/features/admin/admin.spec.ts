import { HttpErrorResponse } from '@angular/common/http';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { render, screen, within } from '@testing-library/angular';
import { throwError } from 'rxjs';
import userEvent from '@testing-library/user-event';
import {
  MockApiBackend,
  mockSession,
  provideMockApi,
  provideSession,
  resetMockApi,
} from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { TranslatedPaginatorIntl } from '../../core/i18n/translated-paginator-intl';
import { SessionStore } from '../../core/session/session.store';
import { ORG_AKAGERA } from '../../mocks/data';
import { db } from '../../mocks/db';
import { CalendarPage } from './calendar/calendar-page';
import { ChangeControlPage } from './change-control/change-control-page';
import { InvitationsPage } from './invitations/invitations-page';
import { MembersPage } from './members/members-page';
import { OrganizationPage } from './organization/organization-page';

describe('administration', () => {
  let providers: unknown[];

  beforeEach(async () => {
    resetMockApi();
    providers = [
      ...provideTestUi(),
      ...provideMockApi(),
      provideRouter([]),
      { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
      provideSession(await mockSession('admin@kora.demo')),
    ];
  });

  /** Renders a page as the signed-in admin. */
  const open = (page: Type<unknown>) => render(page, { providers: providers as never[] });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const rowFor = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

  describe('MembersPage', () => {
    it('lists members sorted by name, marks you and pages with translated labels', async () => {
      await open(MembersPage);

      expect(await screen.findByText('Members: 23')).toBeTruthy();
      expect(screen.getAllByRole('row')).toHaveLength(21); // header + 20
      expect(within(rowFor('Aline Uwase')).getByText('You')).toBeTruthy();
      expect(within(rowFor('Aline Uwase')).queryByRole('button', { name: /Remove/ })).toBeNull();
      expect(screen.getByText('1–20 of 23')).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
      expect(await screen.findByText('21–23 of 23')).toBeTruthy();
    });

    it('searches after a pause and filters by role', async () => {
      await open(MembersPage);
      await screen.findByText('Members: 23');

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search by name or email' }),
        'kora.demo',
      );
      expect(await screen.findByText('Members: 5', {}, { timeout: 5000 })).toBeTruthy();

      await userEvent.click(screen.getByRole('combobox', { name: 'Role' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Viewer' }));
      expect(await screen.findByText('Members: 1')).toBeTruthy();
      expect(rowFor('Diane Ingabire')).toBeTruthy();
    });

    it('sorts on the server when a column header is clicked', async () => {
      await open(MembersPage);
      await screen.findByText('Members: 23');

      await userEvent.click(screen.getByRole('button', { name: /Joined/ }));

      await vi.waitFor(() =>
        expect(screen.getAllByRole('row')[1].textContent).toContain('Aline Uwase'),
      );
    });

    it('changes a role inline and confirms it', async () => {
      await open(MembersPage);
      await screen.findByText('Members: 23');

      await userEvent.click(screen.getByRole('combobox', { name: 'Role of Diane Ingabire' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Member' }));

      expect(await screen.findByText('Diane Ingabire is now Member.')).toBeTruthy();
      expect(
        db.state.memberships.find((m) => m.userId === db.userByEmail('viewer@kora.demo')!.id)!.role,
      ).toBe('MEMBER');
    });

    it('reloads the list when someone else changed the member first (412)', async () => {
      await open(MembersPage);
      await screen.findByText('Members: 23');
      // Another admin changes Diane meanwhile: her version moves on.
      const diane = db.state.memberships.find(
        (m) => m.userId === db.userByEmail('viewer@kora.demo')!.id,
      )!;
      diane.role = 'PMO';
      diane.version += 1;
      db.save();

      await userEvent.click(screen.getByRole('combobox', { name: 'Role of Diane Ingabire' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Member' }));

      expect(await screen.findByText(/Someone else saved changes first/)).toBeTruthy();
      await vi.waitFor(() =>
        expect(within(rowFor('Diane Ingabire')).getByText('PMO')).toBeTruthy(),
      );
    });

    it('shows the API reason when a change is refused and puts the role back', async () => {
      // Demoting the last admin can't be reached through the UI (your own row is read-only), so the
      // refusal is injected at the HTTP level; the interceptor and store handle it for real.
      const handle = MockApiBackend.prototype.handle;
      vi.spyOn(MockApiBackend.prototype, 'handle').mockImplementation(function (
        this: MockApiBackend,
        req,
      ) {
        return req.method === 'PATCH'
          ? throwError(
              () =>
                new HttpErrorResponse({
                  status: 409,
                  error: { status: 409, code: 'members.last_admin', correlationId: 'c-9' },
                }),
            )
          : handle.call(this, req);
      });
      await open(MembersPage);
      await screen.findByText('Members: 23');

      await userEvent.click(screen.getByRole('combobox', { name: 'Role of Diane Ingabire' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Member' }));

      expect(
        await screen.findByText(/The organization needs at least one administrator./),
      ).toBeTruthy();
      await vi.waitFor(() =>
        expect(within(rowFor('Diane Ingabire')).getByRole('combobox').textContent).toContain(
          'Viewer',
        ),
      );
    });

    it('removes a member after a destructive confirmation', async () => {
      await open(MembersPage);
      await screen.findByText('Members: 23');

      await userEvent.click(
        within(rowFor('Diane Ingabire')).getByRole('button', { name: 'Remove Diane Ingabire' }),
      );
      const dialog = await screen.findByRole('alertdialog');
      expect(
        within(dialog).getByText(/Diane Ingabire will lose access to Akagera Digital Ltd/),
      ).toBeTruthy();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

      expect(await screen.findByText('Diane Ingabire was removed.')).toBeTruthy();
      expect(await screen.findByText('Members: 22')).toBeTruthy();
    });

    it('keeps the member when the removal is cancelled', async () => {
      await open(MembersPage);
      await screen.findByText('Members: 23');

      await userEvent.click(
        within(rowFor('Diane Ingabire')).getByRole('button', { name: 'Remove Diane Ingabire' }),
      );
      await userEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      );

      expect(screen.getByText('Members: 23')).toBeTruthy();
    });
  });

  describe('InvitationsPage', () => {
    it('shows pending invitations by default, with status chips', async () => {
      await open(InvitationsPage);

      expect(await screen.findByText('Invitations: 3')).toBeTruthy();
      expect(within(rowFor('new.person@example.com')).getByText('Pending')).toBeTruthy();
    });

    it('filters by status', async () => {
      await open(InvitationsPage);
      await screen.findByText('Invitations: 3');

      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
      await userEvent.click(await screen.findByRole('option', { name: 'All statuses' }));

      expect(await screen.findByText('Invitations: 6')).toBeTruthy();
      expect(within(rowFor('old.contractor@example.com')).getByText('Expired')).toBeTruthy();
      expect(within(rowFor('old.contractor@example.com')).queryByRole('button')).toBeNull();
    });

    it('invites someone, showing API errors on the email field', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      await open(InvitationsPage);
      await screen.findByText('Invitations: 3');

      await userEvent.click(screen.getByRole('button', { name: 'Invite someone' }));
      const dialog = await screen.findByRole('dialog', { name: 'Invite someone' });
      expect(
        within(dialog).getByText('Works on assigned tasks, logs time and comments.'),
      ).toBeTruthy();

      await userEvent.type(within(dialog).getByRole('textbox', { name: /Email/ }), 'pm@kora.demo');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
      expect(await within(dialog).findByText('This person is already a member.')).toBeTruthy();

      await userEvent.clear(within(dialog).getByRole('textbox', { name: /Email/ }));
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: /Email/ }),
        'fresh@example.com',
      );
      await userEvent.click(within(dialog).getByRole('combobox', { name: /Role/ }));
      await userEvent.click(await screen.findByRole('option', { name: 'Project manager' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

      expect(await screen.findByText('Invitation sent to fresh@example.com.')).toBeTruthy();
      expect(await screen.findByText('Invitations: 4')).toBeTruthy();
      expect(db.state.invitations.at(-1)).toMatchObject({
        email: 'fresh@example.com',
        role: 'PROJECT_MANAGER',
      });
    });

    it('revokes a pending invitation after confirmation', async () => {
      await open(InvitationsPage);
      await screen.findByText('Invitations: 3');

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Revoke the invitation for kevin.mutabazi@example.com',
        }),
      );
      await userEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Revoke' }),
      );

      expect(
        await screen.findByText('The invitation for kevin.mutabazi@example.com was revoked.'),
      ).toBeTruthy();
      expect(await screen.findByText('Invitations: 2')).toBeTruthy();
    });
  });

  describe('OrganizationPage', () => {
    it('saves only what changed, with If-Match, and updates the switcher name', async () => {
      await open(OrganizationPage);
      const name = await screen.findByRole('textbox', { name: /Organization name/ });
      expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(
        true,
      );

      await userEvent.clear(name);
      await userEvent.type(name, 'Akagera Digital');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Organization settings saved.')).toBeTruthy();
      expect(db.organization(ORG_AKAGERA)).toMatchObject({
        name: 'Akagera Digital',
        version: 2,
        currency: 'RWF',
      });
      await vi.waitFor(() =>
        expect(TestBed.inject(SessionStore).activeMembership()?.organizationName).toBe(
          'Akagera Digital',
        ),
      );
    });

    it('explains a concurrent change (412) and reloads the latest version on request', async () => {
      await open(OrganizationPage);
      const name = await screen.findByRole('textbox', { name: /Organization name/ });
      const org = db.organization(ORG_AKAGERA)!;
      org.name = 'Renamed Elsewhere';
      org.version += 1;
      db.save();

      await userEvent.clear(name);
      await userEvent.type(name, 'My Name');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Someone else saved these settings',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
      await vi.waitFor(() =>
        expect(
          (screen.getByRole('textbox', { name: /Organization name/ }) as HTMLInputElement).value,
        ).toBe('Renamed Elsewhere'),
      );
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('validates the name locally', async () => {
      await open(OrganizationPage);
      const name = await screen.findByRole('textbox', { name: /Organization name/ });

      await userEvent.clear(name);
      await userEvent.type(name, 'X');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Must be at least 2 characters.')).toBeTruthy();
    });
  });

  describe('CalendarPage', () => {
    const calendar = () => db.state.calendars.find((c) => c.organizationId === ORG_AKAGERA)!;
    const save = () => screen.getByRole('button', { name: 'Save calendar' });

    it('shows the working days and holidays, and saves changes with If-Match', async () => {
      await open(CalendarPage);
      const saturday = await screen.findByRole('checkbox', { name: 'Saturday' });
      expect((screen.getByRole('checkbox', { name: 'Monday' }) as HTMLInputElement).checked).toBe(
        true,
      );
      expect((saturday as HTMLInputElement).checked).toBe(false);
      expect(screen.getByText('Christmas Day')).toBeTruthy();
      expect(save().hasAttribute('disabled')).toBe(true);

      await userEvent.click(saturday);
      await userEvent.click(screen.getByRole('button', { name: 'Remove Christmas Day' }));
      await userEvent.type(screen.getByLabelText('Date'), '2026-10-05');
      await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Company day');
      await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
      expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
      await userEvent.click(save());

      expect(await screen.findByText('Working calendar saved.')).toBeTruthy();
      expect(calendar()).toMatchObject({ version: 2 });
      expect(calendar().workingDays).toContain('SATURDAY');
      expect(calendar().holidays.map((h) => h.name)).toContain('Company day');
      expect(calendar().holidays.map((h) => h.name)).not.toContain('Christmas Day');
    });

    it('refuses a holiday listed twice and a week without working days', async () => {
      await open(CalendarPage);
      await screen.findByText('Christmas Day');

      await userEvent.type(screen.getByLabelText('Date'), '2026-12-25');
      await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Again');
      await userEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
      expect(await screen.findByText('That date is already a holiday.')).toBeTruthy();

      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        await userEvent.click(screen.getByRole('checkbox', { name: day }));
      }
      await userEvent.click(save());
      expect(await screen.findByText('Choose at least one working day.')).toBeTruthy();
      expect(calendar().version).toBe(1);
    });

    it('explains a concurrent change (412) and reloads the latest version', async () => {
      await open(CalendarPage);
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Sunday' }));
      calendar().version += 1;
      db.save();

      await userEvent.click(save());

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Someone else saved the calendar',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
      await vi.waitFor(() =>
        expect((screen.getByRole('checkbox', { name: 'Sunday' }) as HTMLInputElement).checked).toBe(
          false,
        ),
      );
    });
  });

  describe('ChangeControlPage', () => {
    const settings = () => db.state.changeControls.find((c) => c.organizationId === ORG_AKAGERA);
    const field = (name: RegExp) => screen.getByRole('textbox', { name });

    it('starts from the defaults and saves new thresholds with If-Match', async () => {
      await open(ChangeControlPage);
      const pmoCost = await screen.findByRole('textbox', { name: /PMO approves above this cost/ });
      expect((pmoCost as HTMLInputElement).value).toBe('5');
      expect((field(/PMO approves above this schedule/) as HTMLInputElement).value).toBe('10');

      await userEvent.clear(pmoCost);
      await userEvent.type(pmoCost, '7.5');
      await userEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));

      expect(await screen.findByText('Change-control thresholds saved.')).toBeTruthy();
      expect(settings()).toMatchObject({ pmoCostPercent: 7.5, version: 1 });
    });

    it('refuses a percentage over 100', async () => {
      await open(ChangeControlPage);
      const sponsor = await screen.findByRole('textbox', { name: /Sponsor approves/ });
      await userEvent.clear(sponsor);
      await userEvent.type(sponsor, '150');
      await userEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));

      expect(await screen.findByText('Enter a percentage from 0 to 100.')).toBeTruthy();
      expect(settings()).toBeUndefined();
    });

    it('explains a concurrent change (412)', async () => {
      await open(ChangeControlPage);
      const pmoCost = await screen.findByRole('textbox', { name: /PMO approves above this cost/ });
      db.state.changeControls.push({
        organizationId: ORG_AKAGERA,
        pmoCostPercent: 6,
        pmoScheduleDays: 10,
        sponsorCostPercent: 15,
        version: 1,
      });
      db.save();

      await userEvent.clear(pmoCost);
      await userEvent.type(pmoCost, '8');
      await userEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Someone else saved the thresholds',
      );
    });
  });

  it('TranslatedPaginatorIntl relabels on language change', () => {
    TestBed.configureTestingModule({ providers: providers as never[] });
    const intl = TestBed.inject(MatPaginatorIntl);
    expect(intl.itemsPerPageLabel).toBe('Items per page');
    expect(intl.getRangeLabel(0, 10, 0)).toBe('0 of 0');

    TestBed.inject(TranslocoService).setActiveLang('fr');

    expect(intl.nextPageLabel).toBe('Page suivante');
    expect(intl.getRangeLabel(1, 10, 25)).toBe('11–20 sur 25');
  });
});
