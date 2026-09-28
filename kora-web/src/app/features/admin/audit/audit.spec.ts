import { TestBed } from '@angular/core/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { RecordingDownloader, resetMockApi } from '../../../../testing/mock-api';
import { openRoute } from '../../../../testing/routes';
import { FileDownloader } from '../../../core/files/file-downloader';
import { db } from '../../../mocks/db';
import { ADMIN_ROUTES } from '../admin.routes';
import { csvCell } from './audit-csv';

const routes = [{ path: 'admin', children: ADMIN_ROUTES }];
const log = () => screen.findByRole('table', { name: 'Audit log' }, { timeout: 5000 });

describe('audit log', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('lists the organization’s changes newest first, with details on request', async () => {
    await openRoute(routes, '/admin/audit', 'admin@kora.demo');
    const table = await log();

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Grace Mukamana');
    expect(rows[0].textContent).toContain('Task changed');
    expect(rows[0].textContent).toContain('AKG-001-49');
    expect(rows[0].textContent).toContain('41.186.12.0');

    const details = within(rows[0]).getByRole('button', { name: 'Details: Task changed' });
    await userEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    const diff = within(table).getByRole('table', { name: 'Changes: Task changed' });
    expect(within(diff).getByRole('rowheader', { name: 'Assignee' })).toBeTruthy();
    expect(diff.textContent).toContain('Eric Nshimiyimana');
  });

  it('filters to denied access from the address', async () => {
    await openRoute(routes, '/admin/audit?kind=denied', 'admin@kora.demo');
    const table = await log();

    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(table.textContent).toContain('Diane Ingabire');
    expect(table.textContent).toContain('Denied');
  });

  it('checks the hash chain and says when a row was changed', async () => {
    await openRoute(routes, '/admin/audit', 'admin@kora.demo');
    await log();

    await userEvent.click(screen.getByRole('button', { name: 'Check for tampering' }));
    expect(
      await screen.findByText(/^The record is intact: \d+ entries checked, none changed\.$/),
    ).toBeTruthy();

    db.state.audit[2].entityLabel = 'Changed quietly';
    await userEvent.click(screen.getByRole('button', { name: 'Check for tampering' }));
    expect(await screen.findByText(/^The record was changed: entry .+ doesn’t match/)).toBeTruthy();
  });

  it('exports the rows shown as CSV', async () => {
    await openRoute(routes, '/admin/audit', 'admin@kora.demo');
    await log();

    await userEvent.click(screen.getByRole('button', { name: 'Export the entries shown (CSV)' }));
    const downloader = TestBed.inject(FileDownloader) as unknown as RecordingDownloader;
    const [file] = downloader.saved;
    expect(file.fileName).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.content.split('\r\n')[0]).toBe(
      '﻿When,Who,Address,Action,Item type,Item,Item id,Outcome,Changes,Reference',
    );
    expect(file.content).toContain('Grace Mukamana');
  });
});

describe('CSV cells', () => {
  it('neutralizes formulas and quotes what needs it', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('Kigali, Rwanda')).toBe('"Kigali, Rwanda"');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(undefined)).toBe('');
  });
});
