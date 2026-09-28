import { TestBed } from '@angular/core/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { RecordingDownloader, resetMockApi } from '../../../../../testing/mock-api';
import { openRoute } from '../../../../../testing/routes';
import { FileDownloader } from '../../../../core/files/file-downloader';
import { ATTACHMENT } from '../../../../mocks/data-activity';
import { PROJECT } from '../../../../mocks/data-projects';
import { db } from '../../../../mocks/db';
import { PROJECT_ROUTES } from '../../projects.routes';

const routes = [{ path: 'projects', children: PROJECT_ROUTES }];

/** Opens the mobile app's overview and waits for its files. */
async function open(email = 'pm@kora.demo') {
  await openRoute(routes, `/projects/${PROJECT.mobile}/overview`, email);
  return screen.findByRole('region', { name: 'Files' }, { timeout: 5000 });
}

const pdf = (name = 'Test plan.pdf') =>
  new File(['%PDF-1.4\nhello\n%%EOF'], name, { type: 'application/pdf' });
const user = () => userEvent.setup({ applyAccept: false });
const picker = (files: HTMLElement) => files.querySelector('input[type=file]') as HTMLInputElement;

describe('attachments', () => {
  beforeEach(() => resetMockApi());
  afterEach(() => localStorage.clear());

  it('lists the files with who added them, and downloads through a fresh link', async () => {
    const files = await open();

    const name = await within(files).findByRole('button', { name: 'Download Signed charter.pdf' });
    expect(files.textContent).toContain('added by Grace Mukamana');
    expect(files.textContent).toContain('not scanned');
    await user().click(name);

    const downloader = TestBed.inject(FileDownloader) as unknown as RecordingDownloader;
    await waitFor(() => expect(downloader.opened).toHaveLength(1));
    expect(downloader.opened[0]).toMatchObject({
      url: expect.stringContaining('/mock-storage/files/'),
      fileName: 'Signed charter.pdf',
    });
  });

  it('uploads with the keyboard-reachable button and shows the file when checked', async () => {
    const files = await open();
    await within(files).findByText('Signed charter.pdf');

    expect(within(files).getByRole('button', { name: 'Choose files' })).toBeTruthy();
    await user().upload(picker(files), pdf());

    expect(
      await within(files).findByRole(
        'button',
        { name: 'Download Test plan.pdf' },
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    expect(db.state.attachments.find((a) => a.fileName === 'Test plan.pdf')?.status).toBe(
      'AVAILABLE',
    );
  });

  it('refuses a file type before sending anything', async () => {
    const files = await open();
    const before = db.state.attachments.length;

    await user().upload(picker(files), new File(['MZ'], 'setup.exe'));

    expect(await within(files).findByText('This type of file isn’t accepted.')).toBeTruthy();
    expect(within(files).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(db.state.attachments).toHaveLength(before);
  });

  it('refuses a program renamed to .pdf once the server checks it, without offering a retry', async () => {
    const files = await open();
    await user().upload(
      picker(files),
      new File([new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0])], 'Invoice.pdf', {
        type: 'application/pdf',
      }),
    );

    expect(
      await within(files).findByText(
        'The file isn’t what its name says, so it was refused.',
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    expect(within(files).queryByRole('button', { name: 'Try again' })).toBeNull();
    await user().click(
      within(files).getByRole('button', { name: 'Remove Invoice.pdf from the list' }),
    );
    expect(within(files).queryByText('Invoice.pdf')).toBeNull();
  });

  it('lets a viewer download but not upload or delete', async () => {
    const files = await open('viewer@kora.demo');

    expect(
      await within(files).findByRole('button', { name: 'Download Signed charter.pdf' }),
    ).toBeTruthy();
    expect(within(files).queryByRole('button', { name: 'Choose files' })).toBeNull();
    expect(within(files).queryByRole('button', { name: /^Delete / })).toBeNull();
  });

  it('deletes a file after a destructive confirmation', async () => {
    const files = await open();

    await user().click(
      await within(files).findByRole('button', { name: 'Delete Signed charter.pdf' }),
    );
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Signed charter.pdf?' });
    await user().click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(within(files).queryByText('Signed charter.pdf')).toBeNull());
    expect(db.state.attachments.find((a) => a.id === ATTACHMENT(1))?.deletedAt).toBeTruthy();
  });
});
