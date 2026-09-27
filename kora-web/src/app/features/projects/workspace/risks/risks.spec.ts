import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { PROJECT } from '../../../../mocks/data-projects';
import { RISK } from '../../../../mocks/data-governance';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

/** Opens the mobile app's risks tab and waits for the register. */
async function open(path = '', email = 'pm@kora.demo') {
  const harness = await openRoute(routes, `/projects/${PROJECT.mobile}/risks${path}`, email);
  await screen.findByText(/^Risks: \d+$/, {}, { timeout: 5000 });
  return harness;
}

const heatmap = () => screen.getByRole('table', { name: 'Open risks by probability and impact' });
const register = () => screen.getByRole('table', { name: 'Risk register' });
const sheet = () => screen.findByRole('dialog', {}, { timeout: 5000 });

describe('risks', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('shows the heat map with counts and bands in words, next to the register by score', async () => {
    await open();

    const cell = within(heatmap()).getByRole('button', {
      name: 'Probability 4, impact 4: 1 risks, Critical',
    });
    expect(cell.textContent).toContain('Critical');
    const rows = within(register()).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('AKG-001-R1');
    expect(rows[0].textContent).toContain('Critical · 16');
    expect(within(register()).getByText('Review overdue')).toBeTruthy();
  });

  it('filters the register to a heat map cell, and back', async () => {
    const harness = await open();

    await userEvent.click(
      within(heatmap()).getByRole('button', { name: /Probability 3, impact 5/ }),
    );

    await waitFor(() => expect(screen.getByText('Risks: 1')).toBeTruthy());
    expect(within(register()).getByText(/Core banking API rate limits/)).toBeTruthy();
    expect(TestBed.inject(Router).url).toContain('cell=3-5');
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => expect(screen.getByText('Risks: 7')).toBeTruthy());
    void harness;
  });

  it('offers the strategies of the kind chosen when raising a risk', async () => {
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Raise risk' }));
    const dialog = await screen.findByRole('dialog', { name: 'Raise a risk' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Title' }),
      'Card scheme slips',
    );
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Response strategy' }));
    expect(screen.getByRole('option', { name: /Mitigate/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Exploit/ })).toBeNull();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Kind' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Opportunity' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Response strategy' }));
    expect(screen.getByRole('option', { name: /Exploit/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Mitigate/ })).toBeNull();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Raise risk' }));
    // The new risk opens in its sheet.
    expect(
      await screen.findByRole(
        'dialog',
        { name: /AKG-001-R8 Card scheme slips/ },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(db.state.risks.find((r) => r.title === 'Card scheme slips')?.kind).toBe('OPPORTUNITY');
  });

  it('re-assesses a risk from its sheet and keeps the history', async () => {
    await open(`/${RISK(1)}`);
    const opened = await sheet();
    await within(opened).findAllByText('Critical · 16');

    await userEvent.click(within(opened).getByRole('button', { name: 'Re-assess' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-assess AKG-001-R1' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Probability' }));
    await userEvent.click(await screen.findByRole('option', { name: /2 · Unlikely/ }));
    expect(within(dialog).getByText('Medium · 8')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-assess' }));

    await waitFor(() =>
      expect(within(opened).getAllByText('Medium · 8').length).toBeGreaterThan(0),
    );
    expect(within(opened).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
  });

  it('materializes a risk into an issue and opens it', async () => {
    await open(`/${RISK(2)}`);
    const opened = await sheet();
    await within(opened).findByText(/Core banking API/);

    await userEvent.click(within(opened).getByRole('button', { name: 'It happened' }));
    const dialog = await screen.findByRole('dialog', { name: 'AKG-001-R2 happened' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'It happened' }));

    await waitFor(() => expect(TestBed.inject(Router).url).toMatch(/\/issues\/[0-9a-f-]{36}$/));
    expect(db.state.risks.find((r) => r.id === RISK(2))?.closure).toBe('MATERIALIZED');
  });

  it('lets the owner, not other contributors, act on a risk', async () => {
    await open(`/${RISK(1)}`, 'member@kora.demo');
    const opened = await sheet();
    await within(opened).findByText(/App store review/);
    expect(within(opened).queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
