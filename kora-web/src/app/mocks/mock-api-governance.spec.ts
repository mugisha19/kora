import { call, signIn } from '../../testing/mock-requests';
import { CHANGE_REQUEST, ISSUE, RISK, STAKEHOLDER } from './data-governance';
import { PROJECT } from './data-projects';
import { db } from './db';

/** Contract 0.5.0 rules (risks, issues, stakeholders, change requests) as the mock implements them. */
describe('mock API — governance', () => {
  beforeEach(() => db.reset());

  const MOBILE = PROJECT.mobile;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only: bodies asserted structurally
  type Body = Record<string, any>;
  const get = async (path: string, email = 'pm@kora.demo') => {
    const { headers } = await signIn(email);
    return (await call('GET', path, { headers: headers() })).body as Body;
  };

  describe('risks', () => {
    it('lists the register by score, with bands and overdue reviews', async () => {
      const page = await get(`/projects/${MOBILE}/risks`);
      const risks = page['content'] as Body[];

      expect(risks.map((r) => r['key']).slice(0, 3)).toEqual([
        'AKG-001-R1',
        'AKG-001-R2',
        'AKG-001-R5',
      ]);
      expect(risks[0]).toMatchObject({ score: 16, severity: 'CRITICAL', residualScore: 6 });
      expect(risks.find((r) => r['key'] === 'AKG-001-R5')).toMatchObject({
        severity: 'HIGH',
        reviewOverdue: true,
      });
    });

    it('counts open risks on the heat map with the register filters', async () => {
      const heatmap = await get(`/projects/${MOBILE}/risks/heatmap`);
      const cells = heatmap['cells'] as Body[];
      expect(cells).toHaveLength(25);
      expect(cells[0]).toMatchObject({ probability: 5, impact: 1 });
      expect(cells[24]).toMatchObject({ probability: 1, impact: 5 });
      const total = cells.reduce((sum, c) => sum + c['count'], 0);
      expect(total).toBe(5); // seven risks, two closed

      const threats = await get(`/projects/${MOBILE}/risks/heatmap?kind=OPPORTUNITY`);
      const cell = (threats['cells'] as Body[]).find((c) => c['count'] > 0);
      expect(cell).toMatchObject({ probability: 3, impact: 3, severity: 'MEDIUM', count: 1 });
    });

    it('shows the PMO every open critical risk across projects', async () => {
      const page = await get('/risks', 'pmo@kora.demo');
      expect((page['content'] as Body[]).map((r) => r['key'])).toEqual([
        'AKG-003-R1',
        'AKG-001-R1',
        'AKG-001-R2',
      ]);
    });

    it('raises a risk with its first assessment, refusing a strategy of the other kind', async () => {
      const { headers } = await signIn('member@kora.demo');
      const raise = (body: Body) =>
        call('POST', `/projects/${MOBILE}/risks`, { headers: headers(), body });
      const base = {
        title: 'Card scheme certification slips',
        kind: 'THREAT',
        category: 'EXTERNAL',
        probability: 2,
        impact: 5,
      };

      const wrong = await raise({ ...base, responseStrategy: 'EXPLOIT' });
      expect(wrong.body!['errors']).toEqual([
        expect.objectContaining({ field: 'responseStrategy' }),
      ]);

      const created = await raise(base);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ key: 'AKG-001-R8', score: 10, status: 'IDENTIFIED' });
      const history = await get(`/risks/${created.body!['id']}/assessments`);
      expect(history).toHaveLength(1);
    });

    it('needs a plan to plan a response, and re-scores only through assessments', async () => {
      const { headers } = await signIn('member@kora.demo');
      const risk = await get(`/risks/${RISK(2)}`, 'member@kora.demo');
      const planned = await call('PATCH', `/risks/${RISK(2)}`, {
        headers: { ...headers(), 'If-Match': `"${risk['version']}"` },
        body: { status: 'RESPONSE_PLANNED', responseStrategy: 'MITIGATE' },
      });
      expect(planned.body!['errors']).toEqual([expect.objectContaining({ field: 'responsePlan' })]);

      // The member owns R2, so may re-score it; the history keeps both scores.
      const assessed = await call('POST', `/risks/${RISK(2)}/assessments`, {
        headers: headers(),
        body: { probability: 2, impact: 5, note: 'Load test passed at 3× peak' },
      });
      expect(assessed.status).toBe(201);
      expect(await get(`/risks/${RISK(2)}`)).toMatchObject({ score: 10, severity: 'HIGH' });
      const history = await get(`/risks/${RISK(2)}/assessments`);
      expect((history as unknown as Body[]).map((a) => a['score'])).toEqual([15, 10]);

      // R1 belongs to the project manager.
      const denied = await call('POST', `/risks/${RISK(1)}/assessments`, {
        headers: headers(),
        body: { probability: 1, impact: 1 },
      });
      expect(denied.status).toBe(403);
    });

    it('keeps a closed risk read-only', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('PATCH', `/risks/${RISK(6)}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { title: 'Changed' },
      });
      expect(res.body!['code']).toBe('risks.closed');
    });

    it('materializes a risk into a linked issue in one step', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('POST', `/risks/${RISK(2)}/materialize`, {
        headers: headers(),
        body: { dueDate: '2030-01-10' },
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        key: 'AKG-001-I6',
        priority: 'CRITICAL',
        riskId: RISK(2),
        owner: { fullName: expect.any(String) },
      });
      expect(await get(`/risks/${RISK(2)}`)).toMatchObject({
        status: 'CLOSED',
        closure: 'MATERIALIZED',
        issueId: res.body!['id'],
      });
    });

    it('turns the project red when a critical risk is past its review date', async () => {
      expect(await get(`/projects/${MOBILE}`)).toMatchObject({ health: 'GREEN' });
      const r1 = db.state.risks.find((r) => r.id === RISK(1))!;
      r1.reviewDate = '2020-01-01';
      db.save();

      expect(await get(`/projects/${MOBILE}`)).toMatchObject({
        health: 'RED',
        healthReason: 'A critical risk is open past its response date',
      });
    });
  });

  describe('issues', () => {
    it('lists the most urgent first, flagging overdue and escalated ones', async () => {
      const page = await get(`/projects/${MOBILE}/issues`);
      const issues = page['content'] as Body[];
      expect(issues[0]).toMatchObject({
        key: 'AKG-001-I2',
        priority: 'CRITICAL',
        overdue: true,
        escalated: true,
        riskId: RISK(7),
      });

      const overdue = await get(`/projects/${MOBILE}/issues?overdue=true`);
      expect((overdue['content'] as Body[]).map((i) => i['key'])).toEqual(['AKG-001-I2']);
    });

    it('resolves with a resolution, closes, reopens — and refuses other moves', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const post = (path: string, body?: Body) =>
        call('POST', `/issues/${ISSUE(2)}/${path}`, { headers: headers(), body });

      expect((await post('close')).body!['code']).toBe('issues.invalid_transition');
      const empty = await post('resolve', { resolution: ' ' });
      expect(empty.body!['errors']).toEqual([expect.objectContaining({ field: 'resolution' })]);

      expect(
        (await post('resolve', { resolution: 'Switched to the backup region.' })).body,
      ).toMatchObject({
        status: 'RESOLVED',
        resolution: 'Switched to the backup region.',
        overdue: false,
      });
      expect((await post('close')).body).toMatchObject({ status: 'CLOSED' });
      expect((await post('reopen', { reason: 'It happened again' })).body).toMatchObject({
        status: 'OPEN',
      });
    });

    it('lets the owner move an issue between open and in progress only', async () => {
      const { headers } = await signIn('member@kora.demo');
      const res = await call('PATCH', `/issues/${ISSUE(1)}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { status: 'RESOLVED' },
      });
      expect(res.body!['errors']).toEqual([expect.objectContaining({ field: 'status' })]);

      const back = await call('PATCH', `/issues/${ISSUE(1)}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { status: 'OPEN' },
      });
      expect(back.body).toMatchObject({ status: 'OPEN', version: 2 });
    });
  });

  describe('stakeholders', () => {
    it('places people on the power/interest grid and filters engagement gaps', async () => {
      const grid = await get(`/projects/${MOBILE}/stakeholders/grid`);
      const quadrants = grid['quadrants'] as Body[];
      expect(quadrants.map((q) => q['quadrant'])).toEqual([
        'MANAGE_CLOSELY',
        'KEEP_SATISFIED',
        'KEEP_INFORMED',
        'MONITOR',
      ]);
      expect(quadrants[0]['stakeholders'].map((s: Body) => s['name'])).toEqual([
        'Claudine Uwimana',
        'Odette Mukamurenzi',
        'Thérèse Mukandayisenga',
      ]);

      const gaps = await get(`/projects/${MOBILE}/stakeholders?gap=true`);
      expect((gaps['content'] as Body[]).every((s) => s['engagementGap'] > 0)).toBe(true);
      expect(gaps['content']).toHaveLength(4);
    });

    it('anonymizes a removed stakeholder', async () => {
      const { headers } = await signIn('pm@kora.demo');
      expect(
        (await call('DELETE', `/stakeholders/${STAKEHOLDER(3)}`, { headers: headers() })).status,
      ).toBe(204);

      const removed = await get(`/stakeholders/${STAKEHOLDER(3)}`);
      expect(removed).toMatchObject({ name: 'Removed stakeholder', removed: true });
      expect(removed['email']).toBeUndefined();
      expect(removed['phone']).toBeUndefined();
      const list = await get(`/projects/${MOBILE}/stakeholders`);
      expect((list['content'] as Body[]).some((s) => s['id'] === STAKEHOLDER(3))).toBe(false);
    });

    it('lets only managers change the register', async () => {
      const { headers } = await signIn('member@kora.demo');
      const res = await call('PATCH', `/stakeholders/${STAKEHOLDER(1)}`, {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { power: 1 },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('change requests', () => {
    const draft = async (email: string, body: Body, projectId = MOBILE) => {
      const { headers } = await signIn(email);
      const created = await call('POST', `/projects/${projectId}/change-requests`, {
        headers: headers(),
        body: { title: 'A change', reason: 'Because', type: 'SCOPE', ...body },
      });
      const submitted = await call('POST', `/change-requests/${created.body!['id']}/submit`, {
        headers: headers(),
      });
      return submitted.body as Body;
    };
    const decide = async (email: string, id: string, decision: string, comment?: string) => {
      const { headers } = await signIn(email);
      return call('POST', `/change-requests/${id}/decisions`, {
        headers: headers(),
        body: { decision, ...(comment ? { comment } : {}) },
      });
    };
    const rwf = (amount: string) => ({ amount, currency: 'RWF' });

    it('fills each approver’s inbox', async () => {
      const keys = async (email: string) =>
        ((await get('/approvals/pending', email)) as unknown as Body[]).map((c) => c['key']);

      expect(await keys('pm@kora.demo')).toEqual(['AKG-001-CR3']);
      expect(await keys('pmo@kora.demo')).toEqual(['AKG-001-CR2']);
      expect(await keys('member@kora.demo')).toEqual([]);
    });

    it('needs only the project manager for a small change', async () => {
      const cr = await draft('member@kora.demo', { impact: { costDelta: rwf('1000000') } });
      expect(cr['steps']).toEqual([
        expect.objectContaining({ level: 'PROJECT_MANAGER', state: 'PENDING' }),
      ]);

      const approved = await decide('pm@kora.demo', cr['id'], 'APPROVE');
      expect(approved.body).toMatchObject({ status: 'APPROVED' });
      expect(await get(`/projects/${MOBILE}`)).toMatchObject({
        budget: { amount: '151000000' },
      });
    });

    it('sends a large change through PM → PMO → sponsor and applies it on the last approval', async () => {
      const before = await get(`/projects/${MOBILE}`);
      const cr = await draft('member@kora.demo', {
        impact: {
          costDelta: rwf('30000000'),
          scheduleDeltaDays: 5,
          scopeSummary: 'Cardless cash withdrawals',
          changesCharterScope: true,
        },
      });
      expect(cr['steps'].map((s: Body) => [s['level'], s['reason']])).toEqual([
        ['PROJECT_MANAGER', 'The project manager confirms the impact analysis'],
        ['PMO', 'Cost change of 20% of the budget exceeds 5%'],
        ['SPONSOR', 'Cost change of 20% of the budget exceeds 15%'],
      ]);

      expect((await decide('pm@kora.demo', cr['id'], 'APPROVE')).body).toMatchObject({
        status: 'IN_REVIEW',
      });
      await decide('pmo@kora.demo', cr['id'], 'APPROVE');
      // Not applied until the last step.
      expect(await get(`/projects/${MOBILE}`)).toMatchObject({ budget: before['budget'] });
      const done = await decide('pmo@kora.demo', cr['id'], 'APPROVE', 'Go ahead');
      expect(done.body).toMatchObject({ status: 'APPROVED' });

      const after = await get(`/projects/${MOBILE}`);
      expect(after['budget']).toEqual(rwf('180000000'));
      expect(after['targetEndDate'] > before['targetEndDate']).toBe(true);
      const charter = await get(`/projects/${MOBILE}/charter`);
      expect(charter).toMatchObject({ versionNumber: 2, status: 'APPROVED' });
      expect(charter['inScope']).toContain('Cardless cash withdrawals (AKG-001-CR6)');
    });

    it('never lets requesters approve their own request', async () => {
      const res = await decide('member@kora.demo', CHANGE_REQUEST(3), 'APPROVE');
      expect(res.body!['code']).toBe('change_requests.self_approval');

      // The PMO is not this step's approver.
      expect((await decide('pmo@kora.demo', CHANGE_REQUEST(3), 'APPROVE')).status).toBe(403);
    });

    it('asks the PMO to confirm when the project manager requested the change', async () => {
      const cr = await draft('pm@kora.demo', { impact: { scheduleDeltaDays: 2 } });
      expect(cr['steps'][0]).toMatchObject({ level: 'PROJECT_MANAGER', approverRole: 'PMO' });
      expect(cr['steps'][0]['approver']).toBeUndefined();
    });

    it('needs a comment to reject; a rejected request can be revised', async () => {
      expect((await decide('pm@kora.demo', CHANGE_REQUEST(3), 'REJECT')).body!['errors']).toEqual([
        expect.objectContaining({ field: 'comment' }),
      ]);
      const rejected = await decide('pm@kora.demo', CHANGE_REQUEST(3), 'REJECT', 'Not now');
      expect(rejected.body).toMatchObject({ status: 'REJECTED' });

      const { headers } = await signIn('member@kora.demo');
      const revised = await call('POST', `/change-requests/${CHANGE_REQUEST(3)}/revise`, {
        headers: headers(),
      });
      expect(revised.status).toBe(201);
      expect(revised.body).toMatchObject({
        key: 'AKG-001-CR3',
        revision: 2,
        status: 'DRAFT',
        previousRevisionId: CHANGE_REQUEST(3),
        steps: [],
      });
    });

    it('edits drafts only', async () => {
      const { headers } = await signIn('member@kora.demo');
      const res = await call('PATCH', `/change-requests/${CHANGE_REQUEST(3)}`, {
        headers: { ...headers(), 'If-Match': '"2"' },
        body: { title: 'Changed' },
      });
      expect(res.body!['code']).toBe('change_requests.not_draft');
    });

    it('re-baselines a scheduled project when a schedule change is approved', async () => {
      // The PMO drafts it, so the project manager decides the only step.
      const cr = await draft(
        'pmo@kora.demo',
        { impact: { scheduleDeltaDays: 3 } },
        PROJECT.warehouse,
      );
      await decide('pm@kora.demo', cr['id'], 'APPROVE');

      const schedule = await get(`/projects/${PROJECT.warehouse}/schedule`);
      expect(schedule['baseline']).toMatchObject({ number: 2 });
    });

    it('uses the organization’s thresholds, which only admins change', async () => {
      const pm = await signIn('pm@kora.demo');
      expect(await get('/organization/change-control')).toMatchObject({
        pmoCostPercent: 5,
        pmoScheduleDays: 10,
        sponsorCostPercent: 15,
        version: 0,
      });
      const body = { pmoCostPercent: 10, pmoScheduleDays: 10, sponsorCostPercent: 25 };
      const denied = await call('PUT', '/organization/change-control', {
        headers: { ...pm.headers(), 'If-Match': '"0"' },
        body,
      });
      expect(denied.status).toBe(403);

      const admin = await signIn('admin@kora.demo');
      const saved = await call('PUT', '/organization/change-control', {
        headers: { ...admin.headers(), 'If-Match': '"0"' },
        body,
      });
      expect(saved.body).toMatchObject({ ...body, version: 1 });

      // 8% no longer needs the PMO.
      const cr = await draft('member@kora.demo', { impact: { costDelta: rwf('12000000') } });
      expect(cr['steps'].map((s: Body) => s['level'])).toEqual(['PROJECT_MANAGER']);
    });
  });
});
