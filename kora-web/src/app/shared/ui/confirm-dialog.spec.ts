import { TestBed } from '@angular/core/testing';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { firstValueFrom } from 'rxjs';
import { provideTestUi } from '../../../testing/test-providers';
import { ConfirmDialogService } from './confirm-dialog';

describe('ConfirmDialogService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestUi() });
  });

  async function open(destructive: boolean, confirmLabel?: string) {
    const result = firstValueFrom(
      TestBed.inject(ConfirmDialogService).confirm({
        title: 'Remove member?',
        message: 'Amina will lose access.',
        destructive,
        confirmLabel,
      }),
    );
    TestBed.tick();
    await screen.findByRole(destructive ? 'alertdialog' : 'dialog');
    return result;
  }

  it('resolves true when the user confirms', async () => {
    const result = open(true, 'Remove');

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await result).toBe(true);
  });

  it('resolves false on cancel, with the default confirm label', async () => {
    const result = open(false);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await result).toBe(false);
  });

  it('shows the title and message', async () => {
    void open(false);

    expect(screen.getByRole('heading', { name: 'Remove member?' })).toBeTruthy();
    expect(screen.getByText('Amina will lose access.')).toBeTruthy();
  });
});
