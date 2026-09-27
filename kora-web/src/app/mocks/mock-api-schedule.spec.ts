import { call, signIn } from '../../testing/mock-requests';
import { ORG_VIRUNGA } from './data';
import { PROJECT } from './data-projects';
import { WAREHOUSE_TASK } from './data-schedule';
import { db } from './db';

/** Contract 0.4.0 rules (dependencies, schedule, baselines, calendar) as the mock implements them. */
describe('mock API — schedule', () => {
  beforeEach(() => db.reset());

  const scheduleOf = async (headers: Record<string, string>) =>
    (await call('GET', `/projects/${PROJECT.warehouse}/schedule`, { headers })).body!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only: rows asserted structurally
  const row = (schedule: Record<string, any>, n: number) =>
    schedule['tasks'].find((t: { taskId: string }) => t.taskId === WAREHOUSE_TASK(n));

  it('computes the critical path on working days, with the baseline variance', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const schedule = await scheduleOf(headers());

    expect(schedule['tasks']).toHaveLength(8);
    expect(schedule['baseline']).toMatchObject({
      number: 1,
      savedBy: { fullName: 'Grace Mukamana' },
    });
    // Inventory → design → legal (10 days) → customer mart → loads → dashboards → live.
    expect(schedule['criticalPath']).toEqual([1, 2, 3, 5, 6, 7, 8].map((n) => WAREHOUSE_TASK(n)));
    expect(row(schedule, 1)).toMatchObject({
      key: 'AKG-005-1',
      durationDays: 5,
      totalFloat: 0,
      critical: true,
      startVariance: 0,
    });
    // The finance mart can slip without moving the finish.
    expect(row(schedule, 4)).toMatchObject({ critical: false, totalFloat: 4, freeFloat: 4 });
    // Legal approval took 4 more days than the baseline planned: everything after it is late.
    expect(row(schedule, 3)).toMatchObject({ startVariance: 0, finishVariance: 4 });
    expect(row(schedule, 8)).toMatchObject({ durationDays: 0, finishVariance: 4 });
    expect(row(schedule, 8).earlyStart).toBe(row(schedule, 8).earlyFinish);
    // The milestone sits on the next working day; the project finishes with the dashboards.
    expect(schedule['projectFinish']).toBe(row(schedule, 7).earlyFinish);
  });

  it('refuses a dependency that closes a loop, naming the chain', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const res = await call('POST', `/projects/${PROJECT.warehouse}/dependencies`, {
      headers: headers(),
      body: { predecessorId: WAREHOUSE_TASK(7), successorId: WAREHOUSE_TASK(2) },
    });

    expect(res.status).toBe(409);
    expect(res.body!['code']).toBe('schedule.cycle');
    expect(res.body!['errors'][0]).toMatchObject({
      field: 'successorId',
      params: {
        // The shortest loop: through the start-to-start link from design to the finance mart.
        cycle: ['AKG-005-7', 'AKG-005-2', 'AKG-005-4', 'AKG-005-6', 'AKG-005-7'],
      },
    });
  });

  it('refuses a self-link, a duplicate and a task of another project', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const add = (body: object) =>
      call('POST', `/projects/${PROJECT.warehouse}/dependencies`, { headers: headers(), body });

    const self = await add({ predecessorId: WAREHOUSE_TASK(1), successorId: WAREHOUSE_TASK(1) });
    expect(self.body!['errors']).toEqual([expect.objectContaining({ field: 'successorId' })]);

    const twice = await add({ predecessorId: WAREHOUSE_TASK(1), successorId: WAREHOUSE_TASK(2) });
    expect(twice.body!['code']).toBe('schedule.dependency_exists');

    const mobileTask = db.state.tasks.find((t) => t.projectId === PROJECT.mobile)?.id;
    const foreign = await add({ predecessorId: mobileTask, successorId: WAREHOUSE_TASK(1) });
    expect(foreign.body!['errors']).toEqual([expect.objectContaining({ field: 'predecessorId' })]);
  });

  it('moves the schedule when a link or a constraint changes', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const before = row(await scheduleOf(headers()), 4).earlyStart;

    const added = await call('POST', `/projects/${PROJECT.warehouse}/dependencies`, {
      headers: headers(),
      body: {
        predecessorId: WAREHOUSE_TASK(5),
        successorId: WAREHOUSE_TASK(4),
        type: 'FS',
        lagDays: 1,
      },
    });
    expect(added.status).toBe(201);
    expect(row(await scheduleOf(headers()), 4).earlyStart > before).toBe(true);

    await call('DELETE', `/dependencies/${added.body!['id']}`, { headers: headers() });
    expect(row(await scheduleOf(headers()), 4).earlyStart).toBe(before);

    const constrained = await call('PATCH', `/tasks/${WAREHOUSE_TASK(1)}`, {
      headers: { ...headers(), 'If-Match': '"1"' },
      body: { scheduleConstraint: 'START_NO_EARLIER_THAN' },
    });
    expect(constrained.body!['errors']).toEqual([
      expect.objectContaining({ field: 'constraintDate' }),
    ]);
  });

  it('saves a baseline that later variances compare with', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const saved = await call('POST', `/projects/${PROJECT.warehouse}/schedule/baseline`, {
      headers: headers(),
    });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ number: 2, taskCount: 8 });

    expect(row(await scheduleOf(headers()), 8)).toMatchObject({ finishVariance: 0 });
  });

  it('keeps dependencies and baselines to Predictive and Hybrid projects', async () => {
    const { headers } = await signIn('pm@kora.demo');
    const res = await call('POST', `/projects/${PROJECT.mobile}/schedule/baseline`, {
      headers: headers(),
    });

    expect(res.body!['code']).toBe('schedule.not_predictive');
    // Reading an Agile project's schedule still works.
    const schedule = await call('GET', `/projects/${PROJECT.mobile}/schedule`, {
      headers: headers(),
    });
    expect(schedule.status).toBe(200);
  });

  it('lets only the project managers edit dependencies', async () => {
    const { headers } = await signIn('viewer@kora.demo');
    const res = await call('POST', `/projects/${PROJECT.mobile}/dependencies`, {
      headers: headers(),
      body: { predecessorId: WAREHOUSE_TASK(1), successorId: WAREHOUSE_TASK(2) },
    });

    expect(res.status).toBe(403);
  });

  describe('working calendar', () => {
    it('reads the calendar, with the default for an organization that never saved one', async () => {
      const admin = await signIn('admin@kora.demo');
      const akagera = await call('GET', '/organization/calendar', { headers: admin.headers() });
      expect(akagera.body).toMatchObject({
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        version: 1,
      });
      expect(akagera.body!['holidays'].map((h: { name: string }) => h.name)).toContain(
        'Christmas Day',
      );

      const virunga = await call('GET', '/organization/calendar', {
        headers: admin.headers(ORG_VIRUNGA),
      });
      expect(virunga.body).toMatchObject({ holidays: [], version: 0 });
    });

    it('lets only admins change it, with If-Match, refusing a date listed twice', async () => {
      const pm = await signIn('pm@kora.demo');
      const denied = await call('PUT', '/organization/calendar', {
        headers: { ...pm.headers(), 'If-Match': '"1"' },
        body: { workingDays: ['MONDAY'], holidays: [] },
      });
      expect(denied.status).toBe(403);

      const admin = await signIn('admin@kora.demo');
      const twice = await call('PUT', '/organization/calendar', {
        headers: { ...admin.headers(), 'If-Match': '"1"' },
        body: {
          workingDays: ['MONDAY'],
          holidays: [
            { date: '2026-12-25', name: 'Christmas' },
            { date: '2026-12-25', name: 'Again' },
          ],
        },
      });
      expect(twice.body!['errors']).toEqual([expect.objectContaining({ field: 'holidays' })]);

      const saved = await call('PUT', '/organization/calendar', {
        headers: { ...admin.headers(), 'If-Match': '"1"' },
        body: {
          workingDays: ['SATURDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
          holidays: [{ date: '2026-10-05', name: ' Company day ' }],
        },
      });
      expect(saved.body).toEqual({
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        holidays: [{ date: '2026-10-05', name: 'Company day' }],
        version: 2,
      });
    });
  });
});
