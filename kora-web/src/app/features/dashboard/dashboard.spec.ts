import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { resetMockApi } from '../../../testing/mock-api';
import { openRoute } from '../../../testing/routes';
import { PORTFOLIO } from '../../mocks/data-projects';
import { DASHBOARD_ROUTES } from './dashboard.routes';

const routes = [{ path: 'dashboard', children: DASHBOARD_ROUTES }];

/** A KPI tile's value, by its label. */
const kpi = (label: string) =>
  screen.getByText(label, { selector: '.label' }).nextElementSibling?.textContent?.trim();
const attentionRows = () =>
  within(screen.getByRole('table', { name: 'Needs attention' }))
    .getAllByRole('row')
    .slice(1);

describe('dashboard', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('summarizes the organization for the PMO, with "—" for figures of later releases', async () => {
    await openRoute(routes, '/dashboard', 'pmo@kora.demo');

    await screen.findByText('Active projects');
    expect(kpi('Active projects')).toBe('5');
    expect(kpi('On track')).toBe('50%');
    expect(kpi('Late projects')).toBe('1');
    expect(kpi('SPI / CPI')).toBe('— / —');
    expect(kpi('Open critical risks')).toBe('3');
    expect(kpi('Pending change requests')).toBe('2');
  });

  it('lists the open critical risks across projects, highest score first', async () => {
    await openRoute(routes, '/dashboard', 'pmo@kora.demo');

    const section = await screen.findByRole('region', { name: 'Critical risks' });
    const items = await within(section).findAllByRole('listitem');
    expect(items.map((i) => i.querySelector('.key')?.textContent)).toEqual([
      'AKG-003-R1',
      'AKG-001-R1',
      'AKG-001-R2',
    ]);
    expect(within(items[0]).getByText('Critical · 20')).toBeTruthy();
    expect(within(items[0]).getByRole('link').getAttribute('href')).toContain('/risks/');
  });

  it('gives every chart a table with the same numbers', async () => {
    await openRoute(routes, '/dashboard', 'pmo@kora.demo');

    const health = await screen.findByRole('table', { name: 'Projects by health' });
    expect(
      within(health)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Off track 1', 'At risk 1', 'On track 2', 'Not rated 3']);
    expect(screen.getByRole('table', { name: 'Projects by status' })).toBeTruthy();
  });

  it('lists the projects that need attention worst first, with the reason', async () => {
    await openRoute(routes, '/dashboard', 'pmo@kora.demo');

    await screen.findByRole('table', { name: 'Needs attention' });
    const rows = attentionRows();
    expect(rows[0].textContent).toContain('ERP rollout');
    expect(rows[0].textContent).toContain('Off track (overridden)');
    expect(rows[0].textContent).toContain('Finance module vendor is three months late');
    expect(rows[1].textContent).toContain('Customer self-service portal');
    expect(rows[1].textContent).toMatch(/Past its target end date/);
  });

  it('keeps the portfolio filter in the URL and only counts what the user can see', async () => {
    await openRoute(routes, `/dashboard?portfolioId=${PORTFOLIO.operations}`, 'pmo@kora.demo');

    await screen.findByText('Active projects');
    expect(screen.getByText('of 2 projects')).toBeTruthy();

    await userEvent.click(screen.getByRole('combobox', { name: 'Health' }));
    await userEvent.click(await screen.findByRole('option', { name: 'On track' }));
    await waitFor(() =>
      expect(TestBed.inject(Router).url).toBe(
        `/dashboard?portfolioId=${PORTFOLIO.operations}&health=GREEN`,
      ),
    );
    await waitFor(() => expect(attentionRows()).toHaveLength(1));
    expect(attentionRows()[0].textContent).toContain('Staff digital skills programme');
  });

  it('shows a member only their projects', async () => {
    await openRoute(routes, '/dashboard', 'viewer@kora.demo');

    await screen.findByText('Active projects');
    expect(screen.getByText('of 1 projects')).toBeTruthy();
  });
});
