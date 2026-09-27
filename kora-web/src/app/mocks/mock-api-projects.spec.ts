import { call, signIn } from '../../testing/mock-requests';
import { ORG_AKAGERA, ORG_VIRUNGA, USER } from './data';
import { PEOPLE, PORTFOLIO, PROGRAM, PROJECT } from './data-projects';
import { db } from './db';

/** Contract 0.2.0 rules (portfolios, projects, charter, WBS, dashboard) as the mock implements them. */
describe('mock API — projects', () => {
  beforeEach(() => db.reset());

  const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

  describe('portfolios and programs', () => {
    it('lists portfolios of the organization with counts', async () => {
      const { headers } = await signIn('member@kora.demo');
      const res = await call('GET', '/portfolios', { headers: headers() });

      expect(res.status).toBe(200);
      expect(res.body!['content'].map((p: { name: string }) => p.name)).toEqual([
        'Digital Services 2026',
        'Operations Excellence',
      ]);
      expect(res.body!['content'][0]).toMatchObject({ programCount: 2, projectCount: 5 });
    });

    it('lets only PMO and admins create portfolios', async () => {
      const pm = await signIn('pm@kora.demo');
      const denied = await call('POST', '/portfolios', {
        headers: pm.headers(),
        body: { name: 'New' },
      });
      expect(denied.status).toBe(403);

      const pmo = await signIn('pmo@kora.demo');
      const created = await call('POST', '/portfolios', {
        headers: pmo.headers(),
        body: { name: 'Growth', strategicObjectives: ['Open two branches'] },
      });
      expect(created.status).toBe(201);
      expect(created.headers.get('ETag')).toBe('"1"');
      expect(created.body).toMatchObject({
        name: 'Growth',
        owner: { userId: USER.pmo },
        status: 'ACTIVE',
      });
    });

    it('keeps an archived portfolio read-only until it is reactivated', async () => {
      const { headers } = await signIn();
      const archived = await call('PATCH', `/portfolios/${PORTFOLIO.operations}`, {
        headers: { ...headers(), ...ifMatch(1) },
        body: { status: 'ARCHIVED' },
      });
      expect(archived.body!['status']).toBe('ARCHIVED');

      const rename = await call('PATCH', `/portfolios/${PORTFOLIO.operations}`, {
        headers: { ...headers(), ...ifMatch(2) },
        body: { name: 'Renamed' },
      });
      expect(rename.body!['code']).toBe('portfolios.archived');

      const program = await call('POST', `/portfolios/${PORTFOLIO.operations}/programs`, {
        headers: headers(),
        body: { name: 'People', managerId: USER.pm },
      });
      expect(program.body!['code']).toBe('portfolios.archived');

      const reactivated = await call('PATCH', `/portfolios/${PORTFOLIO.operations}`, {
        headers: { ...headers(), ...ifMatch(2) },
        body: { status: 'ACTIVE' },
      });
      expect(reactivated.status).toBe(200);
    });

    it('refuses to delete a portfolio that still has programs or projects', async () => {
      const { headers } = await signIn();
      const res = await call('DELETE', `/portfolios/${PORTFOLIO.digital}`, { headers: headers() });

      expect(res.status).toBe(409);
      expect(res.body!['code']).toBe('portfolios.not_empty');
    });

    it('checks the program manager holds a managing role', async () => {
      const { headers } = await signIn();
      const res = await call('POST', `/portfolios/${PORTFOLIO.digital}/programs`, {
        headers: headers(),
        body: { name: 'Branches', managerId: USER.viewer },
      });

      expect(res.status).toBe(400);
      expect(res.body!['errors'][0]).toMatchObject({ field: 'managerId', code: 'invalid' });
    });

    it('lists a portfolio’s programs as a plain array', async () => {
      const { headers } = await signIn('viewer@kora.demo');
      const res = await call('GET', `/portfolios/${PORTFOLIO.digital}/programs`, {
        headers: headers(),
      });

      expect(res.body).toEqual([
        expect.objectContaining({ id: PROGRAM.platforms }),
        expect.objectContaining({ id: PROGRAM.channels }),
      ]);
    });
  });

  describe('projects', () => {
    it('shows PMO every project and others only their own', async () => {
      const pmo = await signIn('pmo@kora.demo');
      const all = await call('GET', '/projects?size=50', { headers: pmo.headers() });
      expect(all.body!['totalElements']).toBe(7);

      const viewer = await signIn('viewer@kora.demo');
      const mine = await call('GET', '/projects', { headers: viewer.headers() });
      expect(mine.body!['content'].map((p: { code: string }) => p.code)).toEqual(['AKG-001']);
    });

    it('answers 404, not 403, for a project the caller cannot see', async () => {
      const { headers } = await signIn('viewer@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.erp}`, { headers: headers() });

      expect(res.status).toBe(404);
    });

    it('never shows another organization’s project', async () => {
      const { headers } = await signIn();
      const res = await call('GET', `/projects/${PROJECT.clinic}`, { headers: headers() });

      expect(res.status).toBe(404);
    });

    it('filters by health and derives it with a reason', async () => {
      const { headers } = await signIn();
      const amber = await call('GET', '/projects?health=AMBER', { headers: headers() });
      expect(amber.body!['content']).toHaveLength(1);
      expect(amber.body!['content'][0]).toMatchObject({
        code: 'AKG-002',
        healthOverridden: false,
        healthReason: expect.stringMatching(/^Past its target end date \(\d{4}-\d{2}-\d{2}\)$/),
      });

      const erp = await call('GET', `/projects/${PROJECT.erp}`, { headers: headers() });
      expect(erp.body).toMatchObject({ health: 'RED', healthOverridden: true });
    });

    it('creates a project with an empty draft charter and the caller as manager', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('POST', '/projects', {
        headers: headers(),
        body: {
          code: 'AKG-010',
          name: 'Agent banking',
          portfolioId: PORTFOLIO.digital,
          programId: PROGRAM.channels,
          methodology: 'AGILE',
          startDate: '2026-11-01',
          targetEndDate: '2027-06-30',
          budget: { amount: '40000000', currency: 'RWF' },
        },
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'PROPOSED',
        manager: { userId: USER.pm },
        health: 'GREY',
        allowedTransitions: ['CANCELLED'],
      });
      const charter = await call('GET', `/projects/${res.body!['id']}/charter`, {
        headers: headers(),
      });
      expect(charter.body).toMatchObject({ status: 'DRAFT', versionNumber: 1, objectives: [] });
    });

    it('validates the project form like the API', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('POST', '/projects', {
        headers: headers(),
        body: {
          code: 'akg 1',
          name: 'X',
          portfolioId: PORTFOLIO.digital,
          methodology: 'SCRUM',
          startDate: '2026-11-01',
          targetEndDate: '2026-10-01',
          budget: { amount: '100.50', currency: 'RWF' },
        },
      });

      expect(res.status).toBe(400);
      expect(res.body!['errors'].map((e: { field: string }) => e.field)).toEqual([
        'code',
        'name',
        'methodology',
        'budget.amount',
      ]);
    });

    it('rejects an end date before the start and a budget in another currency', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const base = {
        code: 'AKG-011',
        name: 'Kiosks',
        portfolioId: PORTFOLIO.digital,
        methodology: 'AGILE',
      };
      const dates = await call('POST', '/projects', {
        headers: headers(),
        body: { ...base, startDate: '2026-11-01', targetEndDate: '2026-11-01' },
      });
      expect(dates.body!['errors']).toEqual([expect.objectContaining({ field: 'targetEndDate' })]);

      const currency = await call('POST', '/projects', {
        headers: headers(),
        body: {
          ...base,
          startDate: '2026-11-01',
          targetEndDate: '2027-01-01',
          budget: { amount: '10', currency: 'USD' },
        },
      });
      expect(currency.body!['errors']).toEqual([
        expect.objectContaining({ field: 'budget.currency' }),
      ]);
    });

    it('reports a taken code on the code field', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('POST', '/projects', {
        headers: headers(),
        body: {
          code: 'AKG-001',
          name: 'Duplicate',
          portfolioId: PORTFOLIO.digital,
          methodology: 'AGILE',
          startDate: '2026-11-01',
          targetEndDate: '2027-01-01',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'projects.code_taken', errors: [{ field: 'code' }] });
    });

    it('lets a contributor read but not edit', async () => {
      const { headers } = await signIn('member@kora.demo');
      const res = await call('PATCH', `/projects/${PROJECT.mobile}`, {
        headers: { ...headers(), ...ifMatch(1) },
        body: { name: 'Renamed' },
      });

      expect(res.status).toBe(403);
    });

    it('locks the methodology once the project has left PROPOSED', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('PATCH', `/projects/${PROJECT.mobile}`, {
        headers: { ...headers(), ...ifMatch(1) },
        body: { methodology: 'PREDICTIVE' },
      });

      expect(res.body!['code']).toBe('projects.methodology_locked');
    });

    it('follows the lifecycle and needs a reason to hold or cancel', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const path = `/projects/${PROJECT.mobile}/transitions`;

      const noReason = await call('POST', path, { headers: headers(), body: { to: 'ON_HOLD' } });
      expect(noReason.status).toBe(422);
      expect(noReason.body!['errors']).toEqual([
        expect.objectContaining({ field: 'reason', code: 'required' }),
      ]);

      const held = await call('POST', path, {
        headers: headers(),
        body: { to: 'ON_HOLD', reason: 'Vendor audit' },
      });
      expect(held.body).toMatchObject({
        status: 'ON_HOLD',
        allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
      });

      const invalid = await call('POST', path, { headers: headers(), body: { to: 'CLOSED' } });
      expect(invalid.body!['code']).toBe('projects.invalid_transition');
    });

    it('approves a project only through its charter', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('POST', `/projects/${PROJECT.warehouse}/transitions`, {
        headers: headers(),
        body: { to: 'APPROVED' },
      });

      expect(res.body!['code']).toBe('projects.charter_approval_required');
    });

    it('overrides health with a reason and clears it again', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const path = `/projects/${PROJECT.mobile}/health-override`;
      const set = await call('PUT', path, {
        headers: headers(),
        body: { health: 'RED', reason: 'Key developer left' },
      });
      expect(set.body).toMatchObject({
        health: 'RED',
        healthOverridden: true,
        healthReason: 'Key developer left',
      });

      const cleared = await call('DELETE', path, { headers: headers() });
      expect(cleared.body).toMatchObject({
        health: 'GREEN',
        healthOverridden: false,
        healthReason: 'On track',
      });
    });

    it('manages the team, keeping the manager', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const team = await call('GET', `/projects/${PROJECT.mobile}/members`, { headers: headers() });
      expect(team.body![0]).toMatchObject({ userId: USER.pm, projectRole: 'MANAGER' });

      const added = await call('PUT', `/projects/${PROJECT.mobile}/members/${PEOPLE.alice}`, {
        headers: headers(),
        body: { projectRole: 'CONTRIBUTOR' },
      });
      expect(added.body).toMatchObject({ userId: PEOPLE.alice, projectRole: 'CONTRIBUTOR' });

      const manager = await call('DELETE', `/projects/${PROJECT.mobile}/members/${USER.pm}`, {
        headers: headers(),
      });
      expect(manager.body!['code']).toBe('project_members.is_manager');
    });
  });

  describe('charter', () => {
    it('replaces the draft, then submits and approves it, approving the project', async () => {
      const pm = await signIn('pm@kora.demo');
      const path = `/projects/${PROJECT.warehouse}/charter`;

      const returned = await call('POST', `${path}/return`, {
        headers: (await signIn('pmo@kora.demo')).headers(),
        body: { comment: 'Add a second objective' },
      });
      expect(returned.body).toMatchObject({
        status: 'DRAFT',
        returnComment: 'Add a second objective',
      });

      const missingIfMatch = await call('PUT', path, { headers: pm.headers(), body: {} });
      expect(missingIfMatch.status).toBe(428);

      const replaced = await call('PUT', path, {
        headers: { ...pm.headers(), ...ifMatch(returned.body!['version']) },
        body: {
          purpose: 'One place for reporting data.',
          objectives: [
            { text: 'Daily dashboards', successMetric: 'Ready by 8 am' },
            { text: 'Self-service queries', successMetric: '50 analysts onboarded' },
          ],
          milestones: [{ name: 'First data mart', targetDate: '2027-02-01' }],
          sponsorId: USER.admin,
        },
      });
      expect(replaced.status).toBe(200);
      expect(replaced.body!['objectives']).toHaveLength(2);
      expect(replaced.body!['inScope']).toEqual([]);
      const team = await call('GET', `/projects/${PROJECT.warehouse}/members`, {
        headers: pm.headers(),
      });
      expect(team.body).toContainEqual(
        expect.objectContaining({ userId: USER.admin, projectRole: 'OBSERVER' }),
      );

      const submitted = await call('POST', `${path}/submit`, { headers: pm.headers() });
      expect(submitted.body!['status']).toBe('SUBMITTED');

      const notSponsor = await call('POST', `${path}/approve`, { headers: pm.headers() });
      expect(notSponsor.status).toBe(403);

      const approved = await call('POST', `${path}/approve`, {
        headers: (await signIn()).headers(),
      });
      expect(approved.body).toMatchObject({
        status: 'APPROVED',
        approvedBy: { userId: USER.admin },
      });
      const project = await call('GET', `/projects/${PROJECT.warehouse}`, {
        headers: pm.headers(),
      });
      expect(project.body!['status']).toBe('APPROVED');

      const locked = await call('PUT', path, {
        headers: { ...pm.headers(), ...ifMatch(approved.body!['version']) },
        body: {},
      });
      expect(locked.body!['code']).toBe('charters.not_draft');
    });

    it('names the missing fields when an incomplete charter is submitted', async () => {
      const { headers } = await signIn('olivier.hakizimana@virunga.example');
      const res = await call('POST', `/projects/${PROJECT.depot}/charter/submit`, {
        headers: headers(ORG_VIRUNGA),
      });

      expect(res.status).toBe(409);
      expect(res.body!['code']).toBe('charters.incomplete');
      expect(res.body!['errors'].map((e: { field: string }) => e.field)).toEqual([
        'purpose',
        'objectives',
        'sponsorId',
      ]);
    });

    it('refuses to approve a charter that is not submitted', async () => {
      const { headers } = await signIn();
      const res = await call('POST', `/projects/${PROJECT.mobile}/charter/approve`, {
        headers: headers(),
      });

      expect(res.body!['code']).toBe('charters.not_submitted');
    });

    it('lists versions newest first', async () => {
      const { headers } = await signIn();
      const res = await call('GET', `/projects/${PROJECT.mobile}/charter/versions`, {
        headers: headers(),
      });

      expect(res.body).toEqual([expect.objectContaining({ versionNumber: 1, status: 'APPROVED' })]);
    });
  });

  describe('WBS', () => {
    it('returns the tree with codes and effort-weighted roll-ups', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });
      const [mvp, integration] = res.body!['nodes'];

      expect(mvp).toMatchObject({
        code: '1',
        type: 'DELIVERABLE',
        percentCompleteSource: 'ROLLED_UP',
        plannedEffortHours: 550,
        // (300 × 100 + 250 × 95) / 550
        percentComplete: 97.73,
        plannedCost: { amount: '16500000', currency: 'RWF' },
        earnedValue: { amount: '16125000', currency: 'RWF' },
      });
      expect(mvp.children.map((c: { code: string }) => c.code)).toEqual(['1.1', '1.2']);
      expect(integration).toMatchObject({
        code: '2',
        percentCompleteSource: 'REPORTED',
        percentComplete: 90,
      });
    });

    it('adds nodes only under deliverables', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const tree = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });
      const [mvp, integration] = tree.body!['nodes'];
      const path = `/projects/${PROJECT.portal}/wbs/nodes`;

      const child = await call('POST', path, {
        headers: headers(),
        body: {
          parentId: mvp.id,
          name: 'Notifications',
          type: 'WORK_PACKAGE',
          plannedEffortHours: 50,
          plannedCost: '1500000',
          position: 0,
        },
      });
      expect(child.status).toBe(201);
      expect(child.body).toMatchObject({
        code: '1.1',
        plannedCost: { amount: '1500000', currency: 'RWF' },
      });

      const underPackage = await call('POST', path, {
        headers: headers(),
        body: { parentId: integration.id, name: 'Nope', type: 'WORK_PACKAGE' },
      });
      expect(underPackage.body!['code']).toBe('wbs.parent_not_deliverable');

      const deliverableFigures = await call('POST', path, {
        headers: headers(),
        body: { name: 'Phase 2', type: 'DELIVERABLE', percentComplete: 10 },
      });
      expect(deliverableFigures.body!['errors']).toEqual([
        expect.objectContaining({ field: 'percentComplete' }),
      ]);

      const decimals = await call('POST', path, {
        headers: headers(),
        body: { name: 'Fees', type: 'WORK_PACKAGE', plannedCost: '10.5' },
      });
      expect(decimals.body!['errors']).toEqual([expect.objectContaining({ field: 'plannedCost' })]);
    });

    it('limits the tree to eight levels', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const path = `/projects/${PROJECT.portal}/wbs/nodes`;
      let parentId: string | undefined;
      for (let level = 1; level <= 8; level++) {
        const res = await call('POST', path, {
          headers: headers(),
          body: { parentId, name: `L${level}`, type: 'DELIVERABLE' },
        });
        expect(res.status).toBe(201);
        parentId = res.body!['id'];
      }
      const tooDeep = await call('POST', path, {
        headers: headers(),
        body: { parentId, name: 'L9', type: 'DELIVERABLE' },
      });

      expect(tooDeep.body!['code']).toBe('wbs.too_deep');
    });

    it('updates a work package, refusing type changes on nodes with children', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const tree = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });
      const [mvp, integration] = tree.body!['nodes'];

      const progress = await call('PATCH', `/wbs/nodes/${integration.id}`, {
        headers: { ...headers(), ...ifMatch(1) },
        body: { percentComplete: 55 },
      });
      expect(progress.body).toMatchObject({ percentComplete: 55, version: 2 });

      const stale = await call('PATCH', `/wbs/nodes/${integration.id}`, {
        headers: { ...headers(), ...ifMatch(1) },
        body: { percentComplete: 60 },
      });
      expect(stale.status).toBe(412);

      const typeChange = await call('PATCH', `/wbs/nodes/${mvp.id}`, {
        headers: { ...headers(), ...ifMatch(1) },
        body: { type: 'WORK_PACKAGE' },
      });
      expect(typeChange.body!['code']).toBe('wbs.type_change_not_allowed');

      const toDeliverable = await call('PATCH', `/wbs/nodes/${integration.id}`, {
        headers: { ...headers(), ...ifMatch(2) },
        body: { type: 'DELIVERABLE' },
      });
      expect(toDeliverable.body).toMatchObject({
        type: 'DELIVERABLE',
        percentComplete: 0,
        plannedEffortHours: 0,
      });
    });

    it('deletes a node with children only with cascade', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const tree = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });
      const [mvp] = tree.body!['nodes'];

      const refused = await call('DELETE', `/wbs/nodes/${mvp.id}`, { headers: headers() });
      expect(refused.body!['code']).toBe('wbs.has_children');

      const deleted = await call('DELETE', `/wbs/nodes/${mvp.id}?cascade=true`, {
        headers: headers(),
      });
      expect(deleted.status).toBe(204);
      const after = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });
      expect(after.body!['nodes']).toEqual([
        expect.objectContaining({ code: '1', name: 'Contact centre integration' }),
      ]);
    });

    it('moves nodes, renumbering codes and refusing cycles', async () => {
      const { headers } = await signIn('pm@kora.demo');
      const tree = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });
      const [mvp, integration] = tree.body!['nodes'];

      const moved = await call('POST', `/wbs/nodes/${integration.id}/move`, {
        headers: headers(),
        body: { newParentId: mvp.id, position: 0 },
      });
      expect(moved.status).toBe(200);
      expect(moved.body!['nodes']).toHaveLength(1);
      expect(
        moved.body!['nodes'][0].children.map(
          (c: { code: string; name: string }) => `${c.code} ${c.name}`,
        ),
      ).toEqual(['1.1 Contact centre integration', '1.2 Account requests', '1.3 Document upload']);

      const cycle = await call('POST', `/wbs/nodes/${mvp.id}/move`, {
        headers: headers(),
        body: { newParentId: mvp.id, position: 0 },
      });
      expect(cycle.body!['code']).toBe('wbs.cycle');
    });

    it('hides the WBS of a project the caller cannot see', async () => {
      const { headers } = await signIn('viewer@kora.demo');
      const res = await call('GET', `/projects/${PROJECT.portal}/wbs`, { headers: headers() });

      expect(res.status).toBe(404);
    });
  });

  describe('dashboard', () => {
    it('summarizes the visible projects', async () => {
      const { headers } = await signIn('pmo@kora.demo');
      const res = await call('GET', '/dashboard/summary', { headers: headers() });

      expect(res.body).toMatchObject({
        projectCount: 7,
        byHealth: { GREEN: 2, AMBER: 1, RED: 1, GREY: 3 },
        lateProjects: 1,
        totalBudget: { amount: '730000000', currency: 'RWF' },
      });
      // Σ EV ÷ Σ PV and Σ EV ÷ Σ AC over the running projects (contract 0.6.0).
      expect(res.body).toMatchObject({ portfolioSpi: 0.87, portfolioCpi: 1.53 });
    });

    it('lists the worst projects first unless a sort is given', async () => {
      const { headers } = await signIn('pmo@kora.demo');
      const res = await call('GET', '/dashboard/projects', { headers: headers() });
      expect(res.body!['content'].map((p: { health: string }) => p.health)).toEqual([
        'RED',
        'AMBER',
        'GREY',
        'GREY',
        'GREY',
        'GREEN',
        'GREEN',
      ]);
      expect(res.body!['content'][0]).toMatchObject({
        code: 'AKG-003',
        nextMilestone: { name: 'Finance module live' },
      });

      const byCode = await call('GET', '/dashboard/projects?sort=code,desc', {
        headers: headers(),
      });
      expect(byCode.body!['content'][0]['code']).toBe('AKG-007');
    });

    it('scopes the dashboard to a portfolio', async () => {
      const { headers } = await signIn('pmo@kora.demo');
      const res = await call('GET', `/dashboard/summary?portfolioId=${PORTFOLIO.operations}`, {
        headers: headers(),
      });

      expect(res.body!['projectCount']).toBe(2);
    });
  });

  it('keeps each organization’s data apart', async () => {
    const { headers } = await signIn('admin@kora.demo');
    const res = await call('GET', '/portfolios', { headers: headers(ORG_AKAGERA) });

    expect(res.body!['content'].every((p: { id: string }) => p.id !== PORTFOLIO.construction)).toBe(
      true,
    );
  });
});
