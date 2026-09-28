import { call, signIn } from '../../testing/mock-requests';
import { broker, installMockBroker } from './broker';
import { ORG_AKAGERA, USER } from './data';
import { ATTACHMENT } from './data-activity';
import { CHANGE_REQUEST, RISK } from './data-governance';
import { PROJECT } from './data-projects';
import { db } from './db';
import { setReportDuration } from './handlers/report.handlers';
import { respond } from './respond';

/** Contract 0.7.0 and 0.8.0 rules (notifications, activity, audit, attachments, reports) in the mock. */
describe('mock API — notifications, activity, audit, attachments and reports', () => {
  beforeEach(() => {
    db.reset();
    setReportDuration(30);
  });
  afterEach(() => broker.setOnline(true));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only: bodies asserted structurally
  type Body = Record<string, any>;
  const as = async (email: string) => {
    const { headers, token } = await signIn(email);
    const send = async (method: string, path: string, body?: unknown) =>
      call(method, path, { headers: headers(), ...(body === undefined ? {} : { body }) });
    return { send, token, headers };
  };
  /** Assigns a mobile task (PATCH needs the current version in If-Match). */
  const assign = async (email: string, n: number, assigneeId: string) => {
    const { headers } = await signIn(email);
    const task = mobileTask(n);
    return call('PATCH', `/tasks/${task.id}`, {
      headers: { ...headers(), 'If-Match': `"${task.version}"` },
      body: { assigneeId },
    });
  };
  const mobileTask = (n: number) =>
    db.state.tasks.find((t) => t.projectId === PROJECT.mobile && t.number === n)!;
  const notificationsOf = (userId: string) =>
    db.state.notifications.filter((n) => n.userId === userId);
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  describe('notifications', () => {
    it('lists mine newest first with the unread count, in pages', async () => {
      const member = await as('member@kora.demo');
      const first = (await member.send('GET', '/notifications?limit=2')).body as Body;

      expect(first['unreadCount']).toBe(2);
      expect(first['items'].map((n: Body) => n['type'])).toEqual([
        'TASK_ASSIGNED',
        'RISK_REVIEW_OVERDUE',
      ]);
      expect(first['items'][0]).toMatchObject({
        titleKey: 'notifications.task_assigned',
        params: { key: 'AKG-001-49', actorId: USER.pm },
        link: expect.stringMatching(/^\/projects\/.+\/tasks\/.+$/),
      });
      const second = (
        await member.send('GET', `/notifications?limit=2&cursor=${first['nextCursor']}`)
      ).body as Body;
      expect(second['items']).toHaveLength(1);
      expect(second['nextCursor']).toBeUndefined();
      expect((await member.send('GET', '/notifications?cursor=nope')).status).toBe(400);
    });

    it('marks one or all as read', async () => {
      const member = await as('member@kora.demo');
      const page = (await member.send('GET', '/notifications?unread=true')).body as Body;
      const read = await member.send('POST', `/notifications/${page['items'][0]['id']}/read`);
      expect(read.body?.['readAt']).toBeTruthy();
      expect(((await member.send('GET', '/notifications')).body as Body)['unreadCount']).toBe(1);

      expect((await member.send('POST', '/notifications/read-all')).status).toBe(204);
      expect(((await member.send('GET', '/notifications')).body as Body)['unreadCount']).toBe(0);
      // Someone else's notification is not found.
      const pm = await as('pm@kora.demo');
      expect((await pm.send('POST', `/notifications/${page['items'][1]['id']}/read`)).status).toBe(
        404,
      );
    });

    it('keeps preferences per person without an organization header', async () => {
      const { token } = await signIn('member@kora.demo');
      const auth = { Authorization: `Bearer ${token}` };
      const defaults = (await call('GET', '/me/notification-preferences', { headers: auth }))
        .body as Body;
      expect(defaults['preferences']).toContainEqual({
        type: 'TASK_ASSIGNED',
        inApp: true,
        email: true,
      });
      expect(defaults['preferences']).toContainEqual({
        type: 'REPORT_READY',
        inApp: true,
        email: false,
      });

      const saved = await call('PUT', '/me/notification-preferences', {
        headers: auth,
        body: { preferences: [{ type: 'TASK_ASSIGNED', inApp: false, email: false }] },
      });
      expect(saved.body?.['preferences']).toContainEqual({
        type: 'TASK_ASSIGNED',
        inApp: false,
        email: false,
      });

      // Turned off: an assignment no longer notifies.
      const before = notificationsOf(USER.member).length;
      expect((await assign('pm@kora.demo', 45, USER.member)).status).toBe(200);
      expect(notificationsOf(USER.member)).toHaveLength(before);
    });
  });

  describe('the outbox', () => {
    it('records a change as an audit row, an activity entry and a notification', async () => {
      const task = mobileTask(45);
      const pm = await as('pm@kora.demo');
      expect((await assign('pm@kora.demo', 45, USER.member)).status).toBe(200);

      const notification = notificationsOf(USER.member).at(-1)!;
      expect(notification).toMatchObject({
        type: 'TASK_ASSIGNED',
        params: { key: 'AKG-001-45', title: task.title, actorId: USER.pm },
        link: `/projects/${PROJECT.mobile}/tasks/${task.id}`,
      });
      const activity = (await pm.send('GET', `/projects/${PROJECT.mobile}/activity?limit=1`))
        .body as Body;
      expect(activity['items'][0]).toMatchObject({
        action: 'task.updated',
        entityType: 'task',
        entityId: task.id,
        entityLabel: 'AKG-001-45',
        actor: { userId: USER.pm },
        changedFields: ['assigneeId'],
      });
      const history = (await pm.send('GET', `/history/task/${task.id}`)).body as Body[];
      expect(history.at(-1)).toMatchObject({
        action: 'task.updated',
        outcome: 'SUCCESS',
        actorIp: '41.186.12.0',
        changes: { assigneeId: { after: USER.member } },
      });
      // Nobody is told about their own assignment.
      const before = notificationsOf(USER.pm).length;
      expect((await assign('pm@kora.demo', 45, USER.pm)).status).toBe(200);
      expect(notificationsOf(USER.pm)).toHaveLength(before);
    });

    it('records refused requests as denied', async () => {
      const viewer = await as('viewer@kora.demo');
      const res = await viewer.send('DELETE', `/attachments/${ATTACHMENT(1)}`);
      expect(res.status).toBe(403);

      const admin = await as('admin@kora.demo');
      const log = (await admin.send('GET', '/audit?action=access.denied')).body as Body;
      expect(log['items'][0]).toMatchObject({
        outcome: 'DENIED',
        entityType: 'request',
        actor: { userId: USER.viewer },
        entityLabel: `DELETE /api/v1/attachments/${ATTACHMENT(1)}`,
      });
    });

    it('asks the next approver and tells the requester the decision', async () => {
      const pm = await as('pm@kora.demo');
      await pm.send('POST', `/change-requests/${CHANGE_REQUEST(4)}/submit`);
      const asked = db.state.notifications.filter(
        (n) => n.type === 'APPROVAL_REQUESTED' && n.params['key'] === 'AKG-001-CR4',
      );
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((n) => n.userId !== USER.pm)).toBe(true);
      expect(asked[0].params).toMatchObject({ requesterId: USER.pm });

      const pmo = await as('pmo@kora.demo');
      const decided = await pmo.send('POST', `/change-requests/${CHANGE_REQUEST(2)}/decisions`, {
        decision: 'REJECT',
        comment: 'Not this release.',
      });
      expect(decided.status).toBe(200);
      // The requester of CR2 is the member.
      expect(notificationsOf(USER.member).at(-1)).toMatchObject({
        type: 'CHANGE_REQUEST_DECIDED',
        params: { key: 'AKG-001-CR2', approved: false, actorId: USER.pmo },
      });
    });

    it('tells a person when their week is decided', async () => {
      const sheet = db.state.timesheets.find(
        (s) => s.userId === USER.member && s.status === 'SUBMITTED',
      )!;
      const pm = await as('pm@kora.demo');
      await pm.send('POST', `/timesheets/${sheet.id}/reject`, { comment: 'Split Tuesday.' });

      expect(notificationsOf(USER.member).at(-1)).toMatchObject({
        type: 'TIMESHEET_DECIDED',
        params: {
          week: expect.stringMatching(/^\d{4}-W\d{2}$/),
          approved: false,
          comment: 'Split Tuesday.',
        },
        link: expect.stringMatching(/^\/timesheets\/\d{4}-W\d{2}$/),
      });
    });
  });

  describe('live delivery', () => {
    beforeEach(() => installMockBroker());

    it('pushes my notifications and the activity of projects I can see', async () => {
      const member = await as('member@kora.demo');
      const session = broker.open(member.headers(), () => undefined);
      expect(session.error).toBeNull();
      const notifications: Body[] = [];
      const activity: Body[] = [];
      session.subscribe('/user/queue/notifications', (b) => notifications.push(JSON.parse(b)));
      session.subscribe(`/topic/projects/${PROJECT.mobile}`, (b) => activity.push(JSON.parse(b)));

      await assign('pm@kora.demo', 45, USER.member);

      expect(notifications).toEqual([expect.objectContaining({ type: 'TASK_ASSIGNED' })]);
      expect(activity).toEqual([expect.objectContaining({ action: 'task.updated' })]);
      session.close();
    });

    it('refuses a bad token, other organizations and projects I cannot see', async () => {
      const member = await as('member@kora.demo');
      expect(broker.open({ Authorization: 'Bearer nope' }, () => undefined).error).toBeTruthy();
      expect(
        broker.open(
          { ...member.headers(), 'X-Organization-Id': crypto.randomUUID() },
          () => undefined,
        ).error,
      ).toBeTruthy();
      const session = broker.open(member.headers(), () => undefined);
      expect(session.subscribe(`/topic/projects/${PROJECT.warehouse}`, () => undefined).error).toBe(
        'Access denied',
      );
      expect(session.subscribe('/topic/anything', () => undefined).error).toBe('Access denied');
      session.close();
    });

    it('drops messages while the network is down and lets clients reconnect', async () => {
      const member = await as('member@kora.demo');
      const states: boolean[] = [];
      const session = broker.open(member.headers(), (online) => states.push(online));
      broker.setOnline(false);
      expect(states).toEqual([false]);
      expect(broker.open(member.headers(), () => undefined).error).toBe('Connection lost');
      broker.setOnline(true);
      expect(states).toEqual([false, true]);
      session.close();
    });
  });

  describe('audit trail', () => {
    it('is for administrators, filtered, newest first', async () => {
      const pm = await as('pm@kora.demo');
      expect((await pm.send('GET', '/audit')).status).toBe(403);

      const admin = await as('admin@kora.demo');
      const log = (await admin.send('GET', '/audit?entityType=change-request')).body as Body;
      expect(log['items'].length).toBeGreaterThan(1);
      expect(log['items'].every((e: Body) => e['entityType'] === 'change-request')).toBe(true);
      const times = log['items'].map((e: Body) => e['occurredAt']);
      expect(times).toEqual([...times].sort().reverse());
    });

    it('detects a changed row with the hash chain', async () => {
      const admin = await as('admin@kora.demo');
      expect((await admin.send('GET', '/audit/verify')).body).toMatchObject({ valid: true });

      const row = db.state.audit[3];
      row.entityLabel = 'Tampered';
      expect((await admin.send('GET', '/audit/verify')).body).toMatchObject({
        valid: false,
        firstBrokenId: row.id,
      });
    });

    it('shows an item’s history to whoever sees its project, else to the admin and PMO', async () => {
      const viewer = await as('viewer@kora.demo');
      expect((await viewer.send('GET', `/history/risk/${RISK(1)}`)).status).toBe(200);
      const membership = db.state.audit.find((a) => a.entityType === 'membership')!;
      expect((await viewer.send('GET', `/history/membership/${membership.entityId}`)).status).toBe(
        404,
      );
      const pmo = await as('pmo@kora.demo');
      expect((await pmo.send('GET', `/history/membership/${membership.entityId}`)).status).toBe(
        200,
      );
      expect((await pmo.send('GET', `/history/Task/${RISK(1)}`)).status).toBe(400);
    });
  });

  describe('attachments', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\nhello\n%%EOF');
    const upload = async (
      email: string,
      fileName: string,
      contentType: string,
      bytes: Uint8Array,
    ) => {
      const user = await as(email);
      const started = await user.send('POST', '/attachments/uploads', {
        ownerType: 'TASK',
        ownerId: mobileTask(45).id,
        fileName,
        contentType,
        sizeBytes: bytes.length,
      });
      return { user, started };
    };
    const put = (url: string, bytes: Uint8Array, contentType: string) =>
      respond(
        new Request(url, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: bytes as Uint8Array<ArrayBuffer>,
        }),
      );

    it('uploads in three steps and checks the content', async () => {
      const { user, started } = await upload(
        'member@kora.demo',
        'Spec.pdf',
        'application/pdf',
        pdf,
      );
      expect(started.status).toBe(201);
      expect(started.body).toMatchObject({
        attachment: { status: 'PENDING', fileName: 'Spec.pdf' },
        uploadMethod: 'PUT',
        uploadHeaders: { 'Content-Type': 'application/pdf' },
      });
      const id = started.body!['attachment']['id'] as string;
      expect((await user.send('POST', `/attachments/${id}/complete`)).body?.['code']).toBe(
        'attachments.not_uploaded',
      );

      expect((await put(started.body!['uploadUrl'], pdf, 'application/pdf'))?.status).toBe(200);
      const done = await user.send('POST', `/attachments/${id}/complete`);
      expect(done.body).toMatchObject({
        status: 'AVAILABLE',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect((await user.send('POST', `/attachments/${id}/complete`)).body?.['code']).toBe(
        'attachments.already_completed',
      );

      const list = (
        await user.send('GET', `/attachments?ownerType=TASK&ownerId=${mobileTask(45).id}`)
      ).body as unknown as Body[];
      expect(list.map((a) => a['fileName'])).toEqual(['Spec.pdf']);
      const link = await user.send('GET', `/attachments/${id}/download`);
      const file = await respond(new Request(link.body!['url']));
      expect(file?.headers.get('Content-Disposition')).toContain('attachment');
      expect(await file!.text()).toBe(new TextDecoder().decode(pdf));
    });

    it('rejects a program renamed to .pdf, unknown types and files too big', async () => {
      const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const { user, started } = await upload(
        'member@kora.demo',
        'Invoice.pdf',
        'application/pdf',
        exe,
      );
      await put(started.body!['uploadUrl'], exe, 'application/pdf');
      const id = started.body!['attachment']['id'] as string;
      expect((await user.send('POST', `/attachments/${id}/complete`)).body?.['code']).toBe(
        'attachments.content_mismatch',
      );

      const script = await upload('member@kora.demo', 'run.exe', 'application/octet-stream', exe);
      expect(script.started.body?.['errors'][0]).toMatchObject({ field: 'fileName' });
      const huge = await user.send('POST', '/attachments/uploads', {
        ownerType: 'TASK',
        ownerId: mobileTask(45).id,
        fileName: 'Big.pdf',
        contentType: 'application/pdf',
        sizeBytes: 26_214_401,
      });
      expect(huge.body?.['errors'][0]).toMatchObject({ field: 'sizeBytes', code: 'range' });
    });

    it('lets viewers download but not upload, and hides files from other organizations', async () => {
      const { started } = await upload('viewer@kora.demo', 'Spec.pdf', 'application/pdf', pdf);
      expect(started.status).toBe(403);
      const viewer = await as('viewer@kora.demo');
      expect((await viewer.send('GET', `/attachments/${ATTACHMENT(1)}/download`)).status).toBe(200);

      // The admin is PMO in another organization: a known id from Akagera is not found there.
      const admin = await signIn('admin@kora.demo');
      const other = db.state.memberships.find(
        (m) => m.userId === USER.admin && m.organizationId !== ORG_AKAGERA,
      )!.organizationId;
      const res = await call('GET', `/attachments/${ATTACHMENT(1)}/download`, {
        headers: admin.headers(other),
      });
      expect(res.status).toBe(404);
    });

    it('deletes for the uploader or a manager', async () => {
      const member = await as('member@kora.demo');
      expect((await member.send('DELETE', `/attachments/${ATTACHMENT(1)}`)).status).toBe(403);
      const pm = await as('pm@kora.demo');
      expect((await pm.send('DELETE', `/attachments/${ATTACHMENT(1)}`)).status).toBe(204);
      expect((await pm.send('GET', `/attachments/${ATTACHMENT(1)}/download`)).status).toBe(404);
    });
  });

  describe('reports', () => {
    it('queues a job, then makes the file and says so', async () => {
      const pm = await as('pm@kora.demo');
      const created = await pm.send('POST', '/reports', {
        type: 'PROJECT_STATUS',
        format: 'PDF',
        params: { projectId: PROJECT.mobile },
      });
      expect(created.status).toBe(202);
      expect(created.headers.get('Location')).toBe(`/api/v1/reports/${created.body!['id']}`);
      expect(created.body).toMatchObject({ status: 'QUEUED' });

      await wait(80);
      const job = (await pm.send('GET', `/reports/${created.body!['id']}`)).body as Body;
      expect(job).toMatchObject({
        status: 'READY',
        fileName: expect.stringMatching(/^project-status-AKG-001-\d{4}-\d{2}-\d{2}\.pdf$/),
        downloadUrl: expect.any(String),
      });
      expect(notificationsOf(USER.pm).at(-1)).toMatchObject({
        type: 'REPORT_READY',
        link: '/reports',
        params: { reportId: job['id'], type: 'PROJECT_STATUS', format: 'PDF' },
      });
      const list = (await pm.send('GET', '/reports')).body as unknown as Body[];
      expect(list[0]['id']).toBe(job['id']);
    });

    it('fails an EVM report without a budget, with a notification', async () => {
      for (const node of db.state.wbsNodes)
        if (node.projectId === PROJECT.mobile) node.plannedCost = '0';
      const pm = await as('pm@kora.demo');
      const created = await pm.send('POST', '/reports', {
        type: 'EVM',
        format: 'XLSX',
        params: { projectId: PROJECT.mobile },
      });
      await wait(80);
      expect((await pm.send('GET', `/reports/${created.body!['id']}`)).body).toMatchObject({
        status: 'FAILED',
        failureReason: 'The WBS has no planned cost',
      });
      expect(notificationsOf(USER.pm).at(-1)?.type).toBe('REPORT_FAILED');
    });

    it('checks access and limits waiting jobs to five', async () => {
      const member = await as('member@kora.demo');
      const timesheets = await member.send('POST', '/reports', {
        type: 'TIMESHEETS',
        format: 'XLSX',
        params: { projectId: PROJECT.mobile },
      });
      expect(timesheets.status).toBe(403);
      expect(
        (await member.send('POST', '/reports', { type: 'EVM', format: 'PDF', params: {} })).body?.[
          'errors'
        ][0],
      ).toMatchObject({ field: 'params.projectId' });

      setReportDuration(60_000);
      for (let i = 0; i < 5; i++) {
        expect(
          (await member.send('POST', '/reports', { type: 'RISK_REGISTER', format: 'PDF' })).status,
        ).toBe(202);
      }
      const sixth = await member.send('POST', '/reports', { type: 'RISK_REGISTER', format: 'PDF' });
      expect(sixth.body?.['code']).toBe('reports.too_many_pending');
    });
  });
});
