import { TestBed } from '@angular/core/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { RecordingDownloader, resetMockApi } from '../../../testing/mock-api';
import { openRoute } from '../../../testing/routes';
import { FileDownloader } from '../../core/files/file-downloader';
import { REPORT_POLL_MS } from '../../core/reports/report-jobs';
import { PROJECT } from '../../mocks/data-projects';
import { db } from '../../mocks/db';
import { setReportDuration } from '../../mocks/handlers/report.handlers';
import { PROJECT_ROUTES } from '../projects/projects.routes';

const routes = [
  {
    path: 'reports',
    loadComponent: () => import('./reports-page').then((m) => m.ReportsPage),
  },
  { path: 'projects', children: PROJECT_ROUTES },
];

describe('reports', () => {
  beforeEach(() => {
    resetMockApi();
    setReportDuration(40);
  });
  afterEach(() => localStorage.clear());

  it('makes a report in the background, then offers the file', async () => {
    await openRoute(routes, '/reports', 'pm@kora.demo');
    await screen.findByText('No reports yet', {}, { timeout: 5000 });

    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }));
    await userEvent.click(await screen.findByRole('option', { name: /AKG-001/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Make the report' }));

    const mine = screen.getByRole('region', { name: 'My reports' });
    expect(await within(mine).findByText('Waiting')).toBeTruthy();
    // Ready through the REPORT_READY notification (or the next poll).
    const download = await within(mine).findByRole(
      'button',
      { name: /^Download project-status-AKG-001-.+\.pdf$/ },
      { timeout: REPORT_POLL_MS + 2000 },
    );
    expect(await screen.findByText('Your project status report (PDF) is ready.')).toBeTruthy();

    await userEvent.click(download);
    const downloader = TestBed.inject(FileDownloader) as unknown as RecordingDownloader;
    await waitFor(() => expect(downloader.opened).toHaveLength(1));
    expect(downloader.opened[0].url).toContain('/mock-storage/reports/');
  });

  it('explains a failed report and the limit on waiting ones', async () => {
    for (const node of db.state.wbsNodes)
      if (node.projectId === PROJECT.mobile) node.plannedCost = '0';
    await openRoute(routes, '/reports', 'pm@kora.demo');
    await screen.findByText('No reports yet', {}, { timeout: 5000 });

    await userEvent.click(screen.getByRole('combobox', { name: 'Report' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Earned value report' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }));
    await userEvent.click(await screen.findByRole('option', { name: /AKG-001/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Make the report' }));

    expect(
      await screen.findByText(
        'The WBS has no planned cost',
        {},
        { timeout: REPORT_POLL_MS + 2000 },
      ),
    ).toBeTruthy();

    setReportDuration(60_000);
    const make = screen.getByRole('button', { name: 'Make the report' });
    // Five waiting (the failed one doesn't count), then one too many.
    for (let i = 0; i < 6; i++) {
      // The button waits for each request to finish.
      await waitFor(() => expect(make.hasAttribute('disabled')).toBe(false));
      await userEvent.click(make);
    }
    expect(
      await screen.findByText('You have 5 reports waiting. Try again when one is ready.'),
    ).toBeTruthy();
    expect(screen.getByText('Waiting: 5 of 5')).toBeTruthy();
  });

  it('exports from a page with the format chosen', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/overview`, 'viewer@kora.demo');

    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Export the project status report' },
        { timeout: 5000 },
      ),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excel, for analysis' }));

    expect(
      await screen.findByText('Making your project status report. We’ll tell you when it’s ready.'),
    ).toBeTruthy();
    expect(db.state.reportJobs).toEqual([
      expect.objectContaining({
        type: 'PROJECT_STATUS',
        format: 'XLSX',
        params: { projectId: PROJECT.mobile },
      }),
    ]);
  });

  it('offers the timesheet summary only to the project’s managers', async () => {
    await openRoute(routes, `/projects/${PROJECT.mobile}/time`, 'member@kora.demo');
    await screen.findByRole('heading', { name: 'Planned hours' }, { timeout: 5000 });

    expect(screen.queryByRole('button', { name: 'Export the timesheet summary' })).toBeNull();
  });
});
