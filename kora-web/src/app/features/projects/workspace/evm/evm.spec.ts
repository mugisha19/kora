import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

/** Opens a project's earned value tab and waits for the methods section. */
async function open(project: string = PROJECT.mobile, email = 'pm@kora.demo') {
  const harness = await openRoute(routes, `/projects/${project}/evm`, email);
  await screen.findByRole('heading', { name: 'Methods' }, { timeout: 5000 });
  return harness;
}

const figures = () => screen.getByRole('region', { name: 'Figures' });
const card = (short: string) =>
  within(figures()).getByText(`(${short})`).closest('li') as HTMLElement;

describe('earned value', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the indices and figures with what they mean, and the methods behind them', async () => {
    await open();

    expect(screen.getByText(/progress by Physical % complete · forecast by Typical/)).toBeTruthy();
    const indices = screen.getByRole('region', { name: 'Performance indices' });
    expect(indices.textContent).toContain('0.95');
    expect(indices.textContent).toContain('For each unit of work planned by now, 0.95 is done.');
    expect(card('BAC').textContent).toMatch(/45,600,000/);
    expect(card('SV').textContent).toContain('Behind schedule by');
    expect(card('CV').textContent).toContain('Under budget by');
    expect(card('AC').textContent).toContain('Approved hours × cost rates.');
    // The S-curve's data is in a table too.
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy(), { timeout: 3000 });
  });

  it('explains a metric it cannot compute', async () => {
    await open(PROJECT.portal, 'pmo@kora.demo');

    // No approved time on the portal yet: the actual cost is zero, so there is no CPI.
    expect(card('AC').textContent).toMatch(/RWF.0/);
    expect(screen.getByRole('region', { name: 'Performance indices' }).textContent).toContain(
      'No actual cost yet',
    );
  });

  it('says so when the WBS has no budget', async () => {
    for (const node of db.state.wbsNodes)
      if (node.projectId === PROJECT.mobile) node.plannedCost = '0';
    await open();

    expect(screen.getByRole('heading', { name: 'No budget in the WBS yet' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Figures' })).toBeNull();
  });

  it('changes the forecast method, and the report follows', async () => {
    await open();

    await userEvent.click(screen.getByRole('combobox', { name: 'Forecast cost by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Atypical (AC + BAC − EV)' }));
    expect(
      screen.getByText('The variance so far was a one-off; the rest goes to plan.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save methods' }));

    expect(await screen.findByText(/forecast by Atypical/, {}, { timeout: 3000 })).toBeTruthy();
    expect(db.state.evmSettings.find((s) => s.projectId === PROJECT.mobile)?.eacMethod).toBe(
      'ATYPICAL',
    );
  });

  it('shows the other methods when someone else changed them first', async () => {
    await open();
    const current = db.state.evmSettings.find((s) => s.projectId === PROJECT.mobile);
    if (current) {
      current.eacMethod = 'COMPOSITE';
      current.version += 1;
    } else {
      db.state.evmSettings.push({
        projectId: PROJECT.mobile,
        percentCompleteMethod: 'PHYSICAL',
        eacMethod: 'COMPOSITE',
        version: 1,
      });
    }

    await userEvent.click(screen.getByRole('combobox', { name: 'Forecast cost by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Atypical (AC + BAC − EV)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save methods' }));

    expect(
      await screen.findByText(/Someone else changed the methods/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Forecast cost by' }).textContent).toContain(
        'Composite',
      ),
    );
  });

  it('lets a viewer read the report but not change the methods', async () => {
    await open(PROJECT.mobile, 'viewer@kora.demo');

    expect(screen.queryByRole('button', { name: 'Save methods' })).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Forecast cost by' }).getAttribute('aria-disabled'),
    ).toBe('true');
  });
});
