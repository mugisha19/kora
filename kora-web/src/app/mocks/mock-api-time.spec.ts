import { call, signIn } from '../../testing/mock-requests';
import { isoWeekOf, mondayOf, plusDays, shiftWeek } from '../shared/format/iso-week';
import { PEOPLE, PROJECT } from './data-projects';
import { db } from './db';
import { orgToday } from './projects-domain';
import { ORG_AKAGERA } from './data';

/** Contract 0.6.0 rules (timesheets, resources, earned value) as the mock implements them. */
describe('mock API — time, resources and earned value', () => {
  beforeEach(() => db.reset());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only: bodies asserted structurally
  type Body = Record<string, any>;
  const today = () => orgToday(ORG_AKAGERA);
  const thisWeek = () => isoWeekOf(today());
  const lastWeek = () => shiftWeek(thisWeek(), -1);
  const mobileTask = (n: number) =>
    db.state.tasks.find((t) => t.projectId === PROJECT.mobile && t.number === n)!.id;
  const get = async (path: string, email = 'pm@kora.demo') => {
    const { headers } = await signIn(email);
    return (await call('GET', path, { headers: headers() })).body as Body;
  };
  const put = async (email: string, week: string, entries: Body[]) => {
    const { headers } = await signIn(email);
    return call('PUT', `/timesheets/me/${week}/entries`, { headers: headers(), body: { entries } });
  };

  describe('timesheets', () => {
    it('shows my week with its sheets, daily totals and status', async () => {
      const week = await get('/timesheets/me', 'member@kora.demo');
      expect(week).toMatchObject({
        week: thisWeek(),
        weekStart: mondayOf(today()),
        status: 'DRAFT',
        editable: true,
        totalHours: 14,
      });
      expect(week['dailyTotals']).toHaveLength(7);
      expect(week['sheets']).toEqual([expect.objectContaining({ projectCode: 'AKG-001' })]);

      const before = await get(`/timesheets/me?week=${lastWeek()}`, 'member@kora.demo');
      expect(before).toMatchObject({ status: 'SUBMITTED', editable: false, totalHours: 35 });
    });

    it('replaces the week’s entries, keeping days within 24 hours', async () => {
      const monday = mondayOf(today());
      const entry = (hours: number, date = monday) => ({ taskId: mobileTask(49), date, hours });

      const saved = await put('member@kora.demo', thisWeek(), [
        entry(6),
        entry(2.5, plusDays(monday, 1)),
      ]);
      expect(saved.body).toMatchObject({ totalHours: 8.5 });

      const tooMuch = await put('member@kora.demo', thisWeek(), [entry(20), entry(5)]);
      expect(tooMuch.body!['errors']).toEqual([expect.objectContaining({ field: 'entries' })]);

      const quarter = await put('member@kora.demo', thisWeek(), [entry(1.1)]);
      expect(quarter.body!['errors']).toEqual([
        expect.objectContaining({ field: 'entries[0].hours' }),
      ]);

      const outside = await put('member@kora.demo', thisWeek(), [entry(1, plusDays(monday, 7))]);
      expect(outside.body!['errors']).toEqual([
        expect.objectContaining({ field: 'entries[0].date' }),
      ]);
    });

    it('logs time only on projects I work on', async () => {
      const monday = mondayOf(today());
      // The viewer only observes the mobile app.
      const observer = await put('viewer@kora.demo', thisWeek(), [
        { taskId: mobileTask(49), date: monday, hours: 1 },
      ]);
      expect(observer.status).toBe(403);
      // The member can't see the warehouse at all.
      const warehouseTask = db.state.tasks.find((t) => t.projectId === PROJECT.warehouse)!.id;
      const hidden = await put('member@kora.demo', thisWeek(), [
        { taskId: warehouseTask, date: monday, hours: 1 },
      ]);
      expect(hidden.status).toBe(404);
    });

    it('locks submitted time and submits only open sheets with entries', async () => {
      const changed = await put('member@kora.demo', lastWeek(), [
        { taskId: mobileTask(49), date: mondayOf(plusDays(today(), -7)), hours: 1 },
      ]);
      expect(changed.body!['code']).toBe('timesheets.locked');

      const { headers } = await signIn('member@kora.demo');
      const submitted = await call('POST', `/timesheets/me/${thisWeek()}/submit`, {
        headers: headers(),
      });
      expect(submitted.body).toMatchObject({ status: 'SUBMITTED', editable: false });
      const again = await call('POST', `/timesheets/me/${thisWeek()}/submit`, {
        headers: headers(),
      });
      expect(again.body!['code']).toBe('timesheets.empty');
    });

    it('shows a sent-back week as editable, with the reviewer’s comment', async () => {
      const odette = db.state.timesheets.find(
        (s) => s.userId === PEOPLE.odette && s.status === 'REJECTED',
      )!;
      const pm = await get(`/timesheets/${odette.id}`);
      expect(pm).toMatchObject({
        status: 'REJECTED',
        comment: expect.stringContaining('school fees'),
      });
    });

    it('lets the project’s managers approve, never the owner', async () => {
      const queue = await get(`/projects/${PROJECT.mobile}/timesheets?status=SUBMITTED`);
      const names = (queue['content'] as Body[]).map((s) => s['user']['fullName']);
      expect(names).toEqual(['Eric Nshimiyimana', 'Grace Mukamana']);
      const [member, own] = queue['content'] as Body[];

      const acBefore = (await get(`/projects/${PROJECT.mobile}/evm`))['ac']['amount'];
      const { headers } = await signIn('pm@kora.demo');
      const approved = await call('POST', `/timesheets/${member['id']}/approve`, {
        headers: headers(),
      });
      expect(approved.body).toMatchObject({
        status: 'APPROVED',
        decidedBy: { fullName: 'Grace Mukamana' },
      });
      const acAfter = (await get(`/projects/${PROJECT.mobile}/evm`))['ac']['amount'];
      // 35 hours at 18 000 RWF.
      expect(Number(acAfter) - Number(acBefore)).toBe(630000);

      const self = await call('POST', `/timesheets/${own['id']}/approve`, { headers: headers() });
      expect(self.body!['code']).toBe('timesheets.self_approval');
      const again = await call('POST', `/timesheets/${member['id']}/reject`, {
        headers: headers(),
        body: { comment: 'Too late' },
      });
      expect(again.body!['code']).toBe('timesheets.not_submitted');

      const pmo = await signIn('pmo@kora.demo');
      const byPmo = await call('POST', `/timesheets/${own['id']}/reject`, {
        headers: pmo.headers(),
        body: { comment: 'Split the meetings by project' },
      });
      expect(byPmo.body).toMatchObject({
        status: 'REJECTED',
        comment: 'Split the meetings by project',
      });
    });

    it('keeps cost rates for administrators and the PMO', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const denied = await call('GET', `/users/${PEOPLE.alice}/cost-rates`, { headers: headers() });
      expect(denied.status).toBe(403);

      const rates = (await get(
        `/users/${db.state.users.find((u) => u.email === 'member@kora.demo')!.id}/cost-rates`,
        'admin@kora.demo',
      )) as unknown as Body[];
      expect(rates.map((r) => r['hourlyRate']['amount'])).toEqual(['18000', '16000']);
    });
  });

  describe('resources', () => {
    const row = (map: Body, name: string) =>
      (map['people'] as Body[]).find((p) => p['user']['fullName'] === name)!['weeks'] as Body[];

    it('combines capacity, leave and allocations into bands', async () => {
      const monday = mondayOf(today());
      const map = await get(
        `/resources/heatmap?from=${monday}&to=${plusDays(monday, 28)}`,
        'pmo@kora.demo',
      );
      expect(map['from']).toBe(monday);

      // The member is on leave Wednesday to Friday next week: 2 of 5 days, so 16 hours.
      expect(row(map, 'Eric Nshimiyimana')[1]).toMatchObject({
        capacityHours: 16,
        allocatedHours: 35,
        band: 'OVER',
      });
      expect(row(map, 'Eric Nshimiyimana')[0]).toMatchObject({
        utilization: 87.5,
        band: 'HEALTHY',
      });
      // Odette works 32 hours a week.
      expect(row(map, 'Odette Mukamurenzi')[0]).toMatchObject({
        capacityHours: 32,
        allocatedHours: 28,
      });
      // From week 4 the project manager also has the warehouse: 48 hours.
      expect(row(map, 'Grace Mukamana')[4]).toMatchObject({
        allocatedHours: 48,
        utilization: 120,
        band: 'OVER',
      });
    });

    it('shows others only their own row, and at most 26 weeks', async () => {
      const mine = await get('/resources/heatmap', 'member@kora.demo');
      expect((mine['people'] as Body[]).map((p) => p['user']['fullName'])).toEqual([
        'Eric Nshimiyimana',
      ]);

      const { headers } = await signIn('pmo@kora.demo');
      const tooLong = await call('GET', `/resources/heatmap?from=2026-01-05&to=2026-12-28`, {
        headers: headers(),
      });
      expect(tooLong.body!['errors']).toEqual([expect.objectContaining({ field: 'to' })]);
    });

    it('saves allocations on Mondays, 0 removing one, and the heat map follows', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const monday = mondayOf(today());
      const member = db.state.users.find((u) => u.email === 'member@kora.demo')!.id;
      const notMonday = await call('PUT', `/projects/${PROJECT.mobile}/allocations`, {
        headers: headers(),
        body: { allocations: [{ userId: member, weekStart: plusDays(monday, 1), hours: 10 }] },
      });
      expect(notMonday.body!['errors']).toEqual([
        expect.objectContaining({ field: 'allocations[0].weekStart' }),
      ]);

      const saved = await call('PUT', `/projects/${PROJECT.mobile}/allocations`, {
        headers: headers(),
        body: { allocations: [{ userId: member, weekStart: monday, hours: 0 }] },
      });
      expect(
        (saved.body as unknown as Body[]).some(
          (a) => a['user']['userId'] === member && a['weekStart'] === monday,
        ),
      ).toBe(false);
      const map = await get(`/resources/heatmap?from=${monday}&to=${monday}`);
      expect(row(map, 'Eric Nshimiyimana')[0]).toMatchObject({ allocatedHours: 0, band: 'UNDER' });
    });

    it('lets people see their own capacity and record leave; the PMO changes hours', async () => {
      const member = db.state.users.find((u) => u.email === 'member@kora.demo')!.id;
      const mine = await get(`/users/${member}/capacity`, 'member@kora.demo');
      expect(mine).toMatchObject({
        hoursPerWeek: 40,
        leave: [expect.objectContaining({ reason: 'Family event' })],
      });

      const { headers } = await signIn('member@kora.demo');
      const other = await call('GET', `/users/${PEOPLE.odette}/capacity`, { headers: headers() });
      expect(other.status).toBe(403);
      const change = await call('PUT', `/users/${member}/capacity`, {
        headers: headers(),
        body: { hoursPerWeek: 20, validFrom: today() },
      });
      expect(change.status).toBe(403);

      const pmo = await signIn('pmo@kora.demo');
      const changed = await call('PUT', `/users/${member}/capacity`, {
        headers: pmo.headers(),
        body: { hoursPerWeek: 20, validFrom: today() },
      });
      expect(changed.body).toMatchObject({ hoursPerWeek: 20 });
    });

    it('adds Rwanda’s public holidays for a year, with the moving feasts', async () => {
      const { headers } = await signIn('admin@kora.demo');
      const res = await call('POST', '/organization/calendar/public-holidays', {
        headers: { ...headers(), 'If-Match': '"1"' },
        body: { country: 'RW', year: 2027 },
      });
      const holidays = res.body!['holidays'] as Body[];
      expect(holidays).toContainEqual({ date: '2027-03-26', name: 'Good Friday' });
      expect(holidays).toContainEqual({ date: '2027-03-29', name: 'Easter Monday' });
      expect(holidays).toContainEqual({ date: '2027-08-06', name: 'Umuganura Day' });
      expect(res.body).toMatchObject({ version: 2 });
    });
  });

  describe('earned value', () => {
    it('reports the mobile app’s metrics from the WBS, the plan and approved time', async () => {
      const evm = await get(`/projects/${PROJECT.mobile}/evm`);
      expect(evm).toMatchObject({
        percentCompleteMethod: 'PHYSICAL',
        eacMethod: 'TYPICAL',
        bac: { amount: '45600000', currency: 'RWF' },
        ev: { amount: '24900000' },
        spi: 0.95,
        unavailable: [],
      });
      // EAC = BAC ÷ CPI = BAC × AC ÷ EV.
      const expected = (45_600_000n * BigInt(evm['ac']['amount'])) / 24_900_000n;
      expect(BigInt(evm['eac']['amount']) - expected).toBeLessThanOrEqual(1n);
    });

    it('changes EV with the percent-complete method (If-Match, managers)', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('PUT', `/projects/${PROJECT.mobile}/evm/settings`, {
        headers: { ...headers(), 'If-Match': '"0"' },
        body: { percentCompleteMethod: 'ZERO_HUNDRED', eacMethod: 'ATYPICAL' },
      });
      expect(res.body).toMatchObject({ version: 1 });
      // Only the finished work packages: research and architecture.
      expect(await get(`/projects/${PROJECT.mobile}/evm`)).toMatchObject({
        ev: { amount: '6000000' },
        eacMethod: 'ATYPICAL',
      });

      const member = await signIn('member@kora.demo');
      const denied = await call('PUT', `/projects/${PROJECT.mobile}/evm/settings`, {
        headers: { ...member.headers(), 'If-Match': '"1"' },
        body: { percentCompleteMethod: 'PHYSICAL', eacMethod: 'TYPICAL' },
      });
      expect(denied.status).toBe(403);
    });

    it('draws a weekly series: PV every week, EV and AC only up to now', async () => {
      const series = await get(`/projects/${PROJECT.mobile}/evm/series`);
      const points = series['points'] as Body[];
      expect(series['bac']).toMatchObject({ amount: '45600000' });
      const past = points.filter((p) => p['weekEnding'] < today());
      const future = points.filter((p) => p['weekEnding'] > plusDays(today(), 6));
      expect(past.length).toBeGreaterThan(10);
      expect(past.every((p) => p['ev'] && p['ac'])).toBe(true);
      expect(future.every((p) => !p['ev'] && !p['ac'] && p['pv'])).toBe(true);
    });

    it('fills the dashboard’s performance figures and monthly trends', async () => {
      const summary = await get('/dashboard/summary', 'pmo@kora.demo');
      expect(summary['portfolioSpi']).toBeGreaterThan(0);
      expect(summary['portfolioCpi']).toBeGreaterThan(0);
      expect(Number(summary['totalActualCost']['amount'])).toBeGreaterThan(0);

      const trends = await get('/dashboard/trends?months=3', 'pmo@kora.demo');
      expect(trends['months']).toHaveLength(3);
      expect(trends['months'][2]).toMatchObject({ month: today().slice(0, 7) });
      expect(trends['months'][2]['spi']).toBeGreaterThan(0);
    });

    it('turns a project red when it falls far behind schedule', async () => {
      for (const node of db.state.wbsNodes.filter((n) => n.projectId === PROJECT.mobile)) {
        node.percentComplete = Math.min(node.percentComplete, 20);
      }
      db.save();
      expect(await get(`/projects/${PROJECT.mobile}`)).toMatchObject({
        health: 'RED',
        healthReason: expect.stringMatching(/^Schedule performance index 0\.\d\d is below 0\.80$/),
      });
    });
  });
});
