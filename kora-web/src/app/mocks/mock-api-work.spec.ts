import { call, signIn } from '../../testing/mock-requests';
import { USER } from './data';
import { PROJECT } from './data-projects';
import { SPRINT, WBS_PAYABLES } from './data-work';
import { db } from './db';

/** Contract 0.3.0 rules (tasks, board, backlog, sprints) as the mock implements them. */
describe('mock API — work', () => {
  beforeEach(() => db.reset());

  const taskId = (key: string) => {
    const [, , number] = key.split('-');
    const task = db.state.tasks.find(
      (t) => t.projectId === PROJECT.mobile && t.number === Number(number),
    );
    if (!task) throw new Error(`No task ${key}`);
    return task.id;
  };
  interface ColumnBody {
    status: string;
    tasks: { key: string }[];
  }
  const column = (board: Record<string, unknown>, status: string) => {
    const found = (board['columns'] as ColumnBody[]).find((c) => c.status === status);
    if (!found) throw new Error(`No column ${status}`);
    return found;
  };

  describe('tasks', () => {
    it('lists tasks in rank order with keys made of the project code and a number', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.mobile}/tasks?size=3`, {
        headers: headers(),
      });

      expect(res.body!['totalElements']).toBe(17);
      expect(res.body!['content'].map((t: { key: string }) => t.key)).toEqual([
        'AKG-001-41',
        'AKG-001-42',
        'AKG-001-43',
      ]);
    });

    it('filters by status and sorts by priority', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call(
        'GET',
        `/projects/${PROJECT.mobile}/tasks?status=IN_PROGRESS&sort=priority,asc`,
        { headers: headers() },
      );

      expect(res.body!['content'][0]).toMatchObject({ key: 'AKG-001-45', priority: 'CRITICAL' });
    });

    it('lets a contributor create a task, starting in the backlog', async () => {
      const { headers } = await signIn('member@kora.demo');
      const res = await call('POST', `/projects/${PROJECT.mobile}/tasks`, {
        headers: headers(),
        body: {
          title: 'Export statements as PDF',
          type: 'STORY',
          storyPoints: 3,
          labels: [' pdf ', 'pdf'],
        },
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        key: 'AKG-001-58',
        status: 'BACKLOG',
        priority: 'MEDIUM',
        labels: ['pdf'],
      });
    });

    it('refuses an observer and checks the assignee and work package', async () => {
      const viewer = await signIn('viewer@kora.demo');
      const denied = await call('POST', `/projects/${PROJECT.mobile}/tasks`, {
        headers: viewer.headers(),
        body: { title: 'x', type: 'TASK' },
      });
      expect(denied.status).toBe(403);

      const pm = await signIn('pm@kora.demo');
      const invalid = await call('POST', `/projects/${PROJECT.mobile}/tasks`, {
        headers: pm.headers(),
        body: { title: 'x', type: 'TASK', assigneeId: USER.viewer, wbsNodeId: WBS_PAYABLES },
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body!['errors'].map((e: { field: string }) => e.field)).toEqual([
        'assigneeId',
        'wbsNodeId',
      ]);
    });

    it("lets a contributor change only tasks that are theirs or nobody's", async () => {
      const { headers } = await signIn('member@kora.demo');
      const others = await call('PATCH', `/tasks/${taskId('AKG-001-44')}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { title: 'Mine now' },
      });
      expect(others.status).toBe(403); // assigned to Odette

      const own = await call('PATCH', `/tasks/${taskId('AKG-001-46')}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { remainingHours: 1 },
      });
      expect(own.body).toMatchObject({ remainingHours: 1, version: 2 });
    });

    it('comments in Markdown, oldest first', async () => {
      const { headers } = await signIn('member@kora.demo');
      const path = `/tasks/${taskId('AKG-001-43')}/comments`;
      await call('POST', path, { headers: headers(), body: { body: 'Fixed in **build 12**' } });

      const res = await call('GET', path, { headers: headers() });
      expect((res.body as unknown as { body: string }[]).map((c) => c.body)).toEqual([
        'Security review asked for **rate limiting** on code requests too.',
        'Added: at most 3 codes per 15 minutes. Ready for review.',
        'Fixed in **build 12**',
      ]);
    });
  });

  describe('moves', () => {
    it('follows the lifecycle and needs a reason to block', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const move = (key: string, body: object) =>
        call('POST', `/tasks/${taskId(key)}/move`, { headers: headers(), body });

      expect((await move('AKG-001-48', { status: 'DONE' })).body!['code']).toBe(
        'tasks.invalid_transition',
      );
      const noReason = await move('AKG-001-48', { status: 'BLOCKED' });
      expect(noReason.status).toBe(400);
      expect(noReason.body!['errors']).toEqual([expect.objectContaining({ field: 'reason' })]);
      expect(
        (await move('AKG-001-48', { status: 'BLOCKED', reason: 'Legal review' })).body,
      ).toMatchObject({
        status: 'BLOCKED',
        blockedReason: 'Legal review',
      });
    });

    it('stops at the WIP limit unless told to move anyway', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const path = `/tasks/${taskId('AKG-001-48')}/move`;

      const full = await call('POST', path, {
        headers: headers(),
        body: { status: 'IN_PROGRESS' },
      });
      expect(full.status).toBe(409);
      expect(full.body!['code']).toBe('tasks.wip_limit_reached');

      const anyway = await call('POST', path, {
        headers: headers(),
        body: { status: 'IN_PROGRESS', override: true },
      });
      expect(anyway.body!['status']).toBe('IN_PROGRESS');
      const board = await call('GET', `/projects/${PROJECT.mobile}/board`, { headers: headers() });
      expect(column(board.body!, 'IN_PROGRESS')).toMatchObject({
        taskCount: 4,
        wipLimit: 3,
        atLimit: true,
      });
    });

    it('finishes a task only when no work remains', async () => {
      const { headers } = await signIn('member@kora.demo');
      const path = `/tasks/${taskId('AKG-001-43')}/move`;

      expect(
        (await call('POST', path, { headers: headers(), body: { status: 'DONE' } })).body!['code'],
      ).toBe('tasks.remaining_work');
      await call('PATCH', `/tasks/${taskId('AKG-001-43')}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { remainingHours: 0 },
      });
      const done = await call('POST', path, { headers: headers(), body: { status: 'DONE' } });
      expect(done.body).toMatchObject({ status: 'DONE', completedAt: expect.any(String) });
    });

    it('reorders between two neighbours and lets only managers reopen finished work', async () => {
      const member = await signIn('member@kora.demo');
      const reopen = await call('POST', `/tasks/${taskId('AKG-001-41')}/move`, {
        headers: member.headers(),
        body: { status: 'TODO' },
      });
      expect(reopen.status).toBe(403);

      const pm = await signIn('pm@kora.demo');
      await call('POST', `/tasks/${taskId('AKG-001-49')}/move`, {
        headers: pm.headers(),
        body: { status: 'TODO', beforeTaskId: taskId('AKG-001-48') },
      });
      const board = await call(
        'GET',
        `/projects/${PROJECT.mobile}/board?sprintId=${SPRINT.active}`,
        {
          headers: pm.headers(),
        },
      );
      expect(column(board.body!, 'TODO').tasks.map((t) => t.key)).toEqual([
        'AKG-001-49',
        'AKG-001-48',
      ]);
    });

    it('rejects neighbours in the wrong order', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('POST', `/tasks/${taskId('AKG-001-49')}/move`, {
        headers: headers(),
        body: {
          status: 'TODO',
          afterTaskId: taskId('AKG-001-48'),
          beforeTaskId: taskId('AKG-001-41'),
        },
      });

      expect(res.body!['errors']).toEqual([expect.objectContaining({ field: 'afterTaskId' })]);
    });
  });

  describe('board and sprints', () => {
    it('shows every board column with project-wide counts, filtered by sprint', async () => {
      const { headers } = await signIn('viewer@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.mobile}/board?sprintId=${SPRINT.active}`, {
        headers: headers(),
      });

      expect(res.body!['columns'].map((c: { name: string }) => c.name)).toEqual([
        'To do',
        'In progress',
        'Blocked',
        'Code review',
        'Done',
      ]);
      // The unplanned "wrong balance" bug is TODO outside the sprint: counted, not shown.
      expect(column(res.body!, 'TODO')).toMatchObject({ taskCount: 3 });
      expect(column(res.body!, 'TODO').tasks).toHaveLength(2);
    });

    it('lets managers configure a column', async () => {
      const pm = await signIn('pm@kora.demo');
      const res = await call('PUT', `/projects/${PROJECT.mobile}/board/columns/BLOCKED`, {
        headers: pm.headers(),
        body: { name: 'Waiting', wipLimit: 2 },
      });
      expect(res.body).toEqual({ status: 'BLOCKED', name: 'Waiting', wipLimit: 2 });

      const member = await signIn('member@kora.demo');
      const denied = await call('PUT', `/projects/${PROJECT.mobile}/board/columns/DONE`, {
        headers: member.headers(),
        body: { name: 'Shipped' },
      });
      expect(denied.status).toBe(403);
    });

    it('lists the backlog: unfinished tasks in no sprint', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.mobile}/backlog`, { headers: headers() });

      expect(res.body!['content'].map((t: { key: string }) => t.key)).toEqual([
        'AKG-001-52',
        'AKG-001-53',
        'AKG-001-54',
        'AKG-001-55',
        'AKG-001-56',
        'AKG-001-57',
      ]);
    });

    it('lists sprints newest first with their points', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.mobile}/sprints`, { headers: headers() });

      expect((res.body as unknown as { name: string }[]).map((s) => s.name)).toEqual([
        'Sprint 6',
        'Sprint 5',
        'Sprint 4',
        'Sprint 3',
        'Sprint 2',
        'Sprint 1',
      ]);
      expect(res.body![1]).toMatchObject({
        status: 'ACTIVE',
        taskCount: 9,
        totalPoints: 29,
        committedPoints: 29,
      });
    });

    it('runs one sprint at a time and closes it with a carry-over', async () => {
      const { headers } = await signIn('pm@kora.demo');

      const second = await call('POST', `/sprints/${SPRINT.next}/start`, { headers: headers() });
      expect(second.body!['code']).toBe('sprints.already_active');

      const wrongTarget = await call('POST', `/sprints/${SPRINT.active}/close`, {
        headers: headers(),
        body: { carryOverTo: SPRINT.one },
      });
      expect(wrongTarget.body!['errors']).toEqual([
        expect.objectContaining({ field: 'carryOverTo' }),
      ]);

      const closed = await call('POST', `/sprints/${SPRINT.active}/close`, {
        headers: headers(),
        body: { carryOverTo: SPRINT.next },
      });
      expect(closed.body).toMatchObject({ status: 'CLOSED', completedPoints: 8, taskCount: 2 });

      const started = await call('POST', `/sprints/${SPRINT.next}/start`, { headers: headers() });
      // 2 planned tasks (7 points) + 7 carried over (21 points), frozen now.
      expect(started.body).toMatchObject({ status: 'ACTIVE', taskCount: 9, committedPoints: 28 });

      const velocity = await call('GET', `/projects/${PROJECT.mobile}/velocity?last=3`, {
        headers: headers(),
      });
      expect(velocity.body).toMatchObject({ average: 17.67, low: 8, high: 23 });
    });

    it('only plans sprints for Agile and Hybrid projects', async () => {
      const { headers } = await signIn('pmo@kora.demo');
      const res = await call('POST', `/projects/${PROJECT.fitOut}/sprints`, {
        headers: headers(),
        body: { name: 'Sprint 1', startDate: '2026-11-02', endDate: '2026-11-13' },
      });

      expect(res.body!['code']).toBe('sprints.not_agile');
    });

    it('moves backlog tasks into a sprint and back', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const added = await call('POST', `/sprints/${SPRINT.next}/tasks`, {
        headers: headers(),
        body: { taskIds: [taskId('AKG-001-52'), taskId('AKG-001-53')] },
      });
      expect(added.body).toMatchObject({ taskCount: 4, totalPoints: 20 });

      const removed = await call(
        'DELETE',
        `/sprints/${SPRINT.next}/tasks/${taskId('AKG-001-52')}`,
        {
          headers: headers(),
        },
      );
      expect(removed.status).toBe(204);

      const otherProject = await call('POST', `/sprints/${SPRINT.next}/tasks`, {
        headers: headers(),
        body: { taskIds: [db.state.tasks.find((t) => t.projectId === PROJECT.erp)!.id] },
      });
      expect(otherProject.body!['errors']).toEqual([expect.objectContaining({ field: 'taskIds' })]);
    });

    it('draws the burndown: an ideal line to zero and the recorded days so far', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('GET', `/sprints/${SPRINT.active}/burndown`, { headers: headers() });

      expect(res.body).toMatchObject({ committedPoints: 29 });
      const days = res.body!['days'];
      expect(days).toHaveLength(14);
      expect(days[0]).toMatchObject({ idealRemaining: 29, actualRemaining: 29 });
      expect(days[13]).toEqual({ date: expect.any(String), idealRemaining: 0 });
      expect(days[6]['actualRemaining']).toBe(21);
      expect(days[7]['actualRemaining']).toBeUndefined();
    });
  });

  it('takes a work package’s progress from its tasks', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const tree = await call('GET', `/projects/${PROJECT.erp}/wbs`, { headers: headers() });
    const payables = tree.body!['nodes'][0]['children'][1];

    expect(payables).toMatchObject({
      name: 'Payables and receivables',
      percentCompleteSource: 'TASKS',
      // (100 × 40 + 62.5 × 80 + 0 × 60) / 180
      percentComplete: 50,
    });

    const pmo = await signIn('pmo@kora.demo');
    const reported = await call('PATCH', `/wbs/nodes/${WBS_PAYABLES}`, {
      headers: { ...pmo.headers(), 'If-Match': `"${payables.version}"` },
      body: { percentComplete: 80 },
    });
    expect(reported.status).toBe(400);
    expect(reported.body!['errors']).toEqual([
      expect.objectContaining({ field: 'percentComplete' }),
    ]);
  });
});
