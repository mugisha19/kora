import { TestBed } from '@angular/core/testing';
import {
  mockSession,
  provideMockApi,
  provideSession,
  resetMockApi,
} from '../../../testing/mock-api';
import { provideTestUi } from '../../../testing/test-providers';
import { USER } from '../../mocks/data';
import { OrgDirectory } from '../people/org-directory';
import { ChangeFormat } from './change-format';

describe('ChangeFormat', () => {
  beforeEach(async () => {
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestUi(),
        ...provideMockApi(),
        provideSession(await mockSession('admin@kora.demo')),
      ],
    });
  });

  it('names fields, translating known ones and splitting the rest into words', () => {
    const format = TestBed.inject(ChangeFormat);
    expect(format.fieldLabel('assigneeId')).toBe('Assignee');
    expect(format.fieldLabel('percentCompleteMethod')).toBe('Percent complete method');
    expect(format.entityLabel('change-request')).toBe('Change request');
    expect(format.entityLabel('capacity-thing')).toBe('Capacity thing');
  });

  it('shows values as people read them', async () => {
    const format = TestBed.inject(ChangeFormat);
    const directory = TestBed.inject(OrgDirectory);
    await vi.waitFor(() => expect(directory.people().length).toBeGreaterThan(0));

    expect(format.value('assigneeId', USER.member)).toBe('Eric Nshimiyimana');
    expect(format.value('ownerId', crypto.randomUUID())).toBe('someone no longer here');
    expect(format.value('status', 'IN_PROGRESS')).toBe('In progress');
    expect(format.value('escalated', true)).toBe('Yes');
    // Money is two fields in the audit: a number and a currency code.
    expect(format.value('budgetAmount', 150000000)).toBe('150,000,000');
    expect(format.value('budgetCurrency', 'RWF')).toBe('RWF');
    expect(format.value('dueDate', '2026-10-05')).toBe('Oct 5, 2026');
    expect(format.value('title', '')).toBe('—');
  });

  it('hides internal fields and keeps secrets without values', () => {
    const format = TestBed.inject(ChangeFormat);
    const lines = format.lines({
      rank: { before: 'a', after: 'b' },
      sha256: { after: 'abc' },
      status: { before: 'TODO', after: 'DONE' },
      passwordHash: {},
    });
    expect(lines.map((l) => l.field)).toEqual(['status', 'passwordHash']);
    expect(lines[1]).toMatchObject({ before: null, after: null });
  });
});
