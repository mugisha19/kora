import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../testing/mock-api';
import { openRoute } from '../../../testing/routes';
import { PORTFOLIO } from '../../mocks/data-projects';
import { PORTFOLIO_ROUTES } from './portfolios.routes';

const routes = [{ path: 'portfolios', children: PORTFOLIO_ROUTES }];

describe('portfolios', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('lists the active portfolios with their objectives and counts', async () => {
    await openRoute(routes, '/portfolios', 'member@kora.demo');

    const digital = (await screen.findByRole('link', { name: 'Digital Services 2026' })).closest(
      'li',
    ) as HTMLElement;
    expect(
      within(digital).getByText('Retire systems that cost more to run than they return'),
    ).toBeTruthy();
    expect(within(digital).getByText('Programs').nextElementSibling?.textContent).toBe('2');
    expect(within(digital).getByText('Projects').nextElementSibling?.textContent).toBe('5');
    expect(screen.queryByRole('button', { name: 'New portfolio' })).toBeNull();
  });

  it('lets the PMO create a portfolio and opens it', async () => {
    await openRoute(routes, '/portfolios', 'pmo@kora.demo');

    await userEvent.click(await screen.findByRole('button', { name: 'New portfolio' }));
    const dialog = await screen.findByRole('dialog', { name: 'New portfolio' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Growth 2027');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Strategic objectives' }),
      'Open two branches{Enter}{Enter}Reach 50,000 agents',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'New portfolio' }));

    // Waits on the dialog closing, a lazy route and three requests.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Growth 2027' }, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Open two branches',
      'Reach 50,000 agents',
    ]);
    expect(TestBed.inject(Router).url).toMatch(/^\/portfolios\/[0-9a-f-]{36}$/);
  });

  it('groups projects by program', async () => {
    await openRoute(routes, `/portfolios/${PORTFOLIO.digital}`, 'pm@kora.demo');

    const platforms = await screen.findByRole('table', { name: 'Core Platforms' });
    // The PM sees the projects they manage or belong to: not Alice's CRM retirement.
    expect(within(platforms).getAllByRole('row')).toHaveLength(3); // header + 2
    expect(screen.getByRole('table', { name: 'Customer Channels' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New project' }).getAttribute('href')).toBe(
      `/projects/new?portfolioId=${PORTFOLIO.digital}`,
    );
    expect(screen.queryByRole('button', { name: 'New program' })).toBeNull();
  });

  it('archives a portfolio, which makes it read-only until reactivated', async () => {
    await openRoute(routes, `/portfolios/${PORTFOLIO.operations}`, 'admin@kora.demo');

    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive' }),
    );

    expect(
      await screen.findByText(
        'This portfolio is archived and read-only. Reactivate it to make changes.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'New program' })).toBeNull());
    expect(screen.queryByRole('link', { name: 'New project' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
  });

  it("doesn't offer to delete a portfolio that still has projects", async () => {
    await openRoute(routes, `/portfolios/${PORTFOLIO.digital}`, 'admin@kora.demo');

    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    const remove = await screen.findByRole('menuitem', { name: 'Delete (only when empty)' });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a program and closes it later', async () => {
    await openRoute(routes, `/portfolios/${PORTFOLIO.operations}`, 'admin@kora.demo');

    await userEvent.click(await screen.findByRole('button', { name: 'New program' }));
    let dialog = await screen.findByRole('dialog', { name: 'New program' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'People');
    await userEvent.click(within(dialog).getByRole('button', { name: 'New program' }));
    expect(await within(dialog).findByText('This field is required.')).toBeTruthy(); // manager
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Program manager' }));
    await userEvent.click(await screen.findByRole('option', { name: /Herve Munyaneza/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'New program' }));

    expect(await screen.findByRole('heading', { name: 'People' })).toBeTruthy();
    expect(screen.getByText('Managed by Herve Munyaneza')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Edit program People' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit program' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Closed' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Program “People” saved.')).toBeTruthy();
  });

  it('edits a portfolio, and deletes one once it is empty', async () => {
    await openRoute(routes, '/portfolios', 'pmo@kora.demo');

    await userEvent.click(await screen.findByRole('button', { name: 'New portfolio' }));
    let dialog = await screen.findByRole('dialog', { name: 'New portfolio' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Temporary');
    await userEvent.click(within(dialog).getByRole('button', { name: 'New portfolio' }));
    await screen.findByRole('heading', { level: 1, name: 'Temporary' }, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit portfolio' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' pilot');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Temporary pilot' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(
        await screen.findByRole('alertdialog', { name: 'Delete “Temporary pilot”?' }),
      ).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => expect(TestBed.inject(Router).url).toBe('/portfolios'));
  });

  it('reactivates an archived portfolio', async () => {
    await openRoute(routes, '/portfolios?status=ARCHIVED', 'admin@kora.demo');
    expect(await screen.findByRole('heading', { name: 'No portfolios yet' })).toBeTruthy();

    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(TestBed.inject(Router).url).toBe('/portfolios?status=ALL'));
  });
});
