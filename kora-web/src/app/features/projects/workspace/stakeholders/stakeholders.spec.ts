import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { STAKEHOLDER } from '../../../../mocks/data-governance';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

async function open(email = 'pm@kora.demo') {
  const harness = await openRoute(routes, `/projects/${PROJECT.mobile}/stakeholders`, email);
  await screen.findByText(/^Stakeholders: \d+$/, {}, { timeout: 5000 });
  return harness;
}

const quadrant = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

describe('stakeholders', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('places everyone in a labelled quadrant, each a button marked with their gap', async () => {
    await open();

    const closely = quadrant('Manage closely');
    expect(within(closely).getByText('High power, high interest')).toBeTruthy();
    expect(
      within(closely).getByRole('button', { name: /Odette Mukamurenzi.*needs 3 more/ }),
    ).toBeTruthy();
    expect(
      within(quadrant('Keep satisfied')).getByRole('button', { name: 'National Bank of Rwanda' }),
    ).toBeTruthy();
    // The engagement matrix marks current and desired in words for screen readers.
    const matrix = screen.getByRole('table', { name: /current .* and desired .* engagement/ });
    expect(within(matrix).getAllByText('current')).toHaveLength(6);
  });

  it('filters to engagement gaps and to one quadrant', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Engagement gap only' }));
    await waitFor(() => expect(screen.getByText('Stakeholders: 4')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /^Manage closely/ }));
    await waitFor(() => expect(screen.getByText('Stakeholders: 2')).toBeTruthy());
  });

  it('removes a stakeholder by erasing their personal data', async () => {
    await open();

    await userEvent.click(
      within(quadrant('Manage closely')).getByRole('button', { name: 'Claudine Uwimana' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Claudine Uwimana' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Claudine Uwimana?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.getByText('Stakeholders: 5')).toBeTruthy());
    const record = db.state.stakeholders.find((s) => s.id === STAKEHOLDER(3));
    expect(record).toMatchObject({ name: 'Removed stakeholder', removed: true });
    expect(record?.email).toBeUndefined();
  });

  it('shows details read-only to someone who does not manage the project', async () => {
    await open('member@kora.demo');

    expect(screen.queryByRole('button', { name: 'Add stakeholder' })).toBeNull();
    await userEvent.click(
      within(quadrant('Keep informed')).getByRole('button', { name: /Retail customers panel/ }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Retail customers panel' });
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(within(dialog).getByText(/Beta builds and a short survey/)).toBeTruthy();
  });
});
