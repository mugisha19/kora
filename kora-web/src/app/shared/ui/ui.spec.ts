import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestUi } from '../../../testing/test-providers';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';
import { PageHeader } from './page-header';
import { StatusChip } from './status-chip';

describe('shared UI', () => {
  const providers = provideTestUi();

  describe('PageHeader', () => {
    it('renders a focusable level-1 heading and the subtitle', async () => {
      await render(PageHeader, {
        inputs: { heading: 'Projects', subtitle: 'All work' },
        providers,
      });

      const heading = screen.getByRole('heading', { level: 1, name: 'Projects' });
      expect(heading.getAttribute('tabindex')).toBe('-1');
      expect(screen.getByText('All work')).toBeTruthy();
    });

    it('omits the subtitle when there is none', async () => {
      const { container } = await render(PageHeader, {
        inputs: { heading: 'Projects' },
        providers,
      });

      expect(container.querySelector('.subtitle')).toBeNull();
    });
  });

  describe('EmptyState', () => {
    it('shows a heading, message and projected action', async () => {
      await render(
        `<kora-empty-state heading="No risks yet" message="Raise the first one."><button>Add risk</button></kora-empty-state>`,
        { imports: [EmptyState], providers },
      );

      expect(screen.getByRole('heading', { level: 2, name: 'No risks yet' })).toBeTruthy();
      expect(screen.getByText('Raise the first one.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add risk' })).toBeTruthy();
    });

    it('omits the message when there is none', async () => {
      const { container } = await render(EmptyState, { inputs: { heading: 'Nothing' }, providers });

      expect(container.querySelector('p')).toBeNull();
    });
  });

  describe('ErrorState', () => {
    it('is announced as an alert with default text and emits retry', async () => {
      const retry = vi.fn();
      await render(ErrorState, { inputs: { correlationId: 'abc-123' }, on: { retry }, providers });

      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
      expect(screen.getByText('Ref. abc-123')).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(retry).toHaveBeenCalledOnce();
    });

    it('uses a custom heading and message', async () => {
      await render(ErrorState, {
        inputs: { heading: 'Board unavailable', message: 'Try later.' },
        providers,
      });

      expect(screen.getByRole('heading', { name: 'Board unavailable' })).toBeTruthy();
      expect(screen.getByText('Try later.')).toBeTruthy();
      expect(screen.queryByText(/Ref\./)).toBeNull();
    });
  });

  describe('LoadingState', () => {
    it('announces a polite status with a default or custom label', async () => {
      const { rerender } = await render(LoadingState, { providers });
      expect(screen.getByRole('status').textContent).toContain('Loading…');

      await rerender({ inputs: { label: 'Loading projects…' } });
      expect(screen.getByRole('status').textContent).toContain('Loading projects…');
    });
  });

  describe('StatusChip', () => {
    it('shows the text label with a tone class and a default icon per tone', async () => {
      const { container } = await render(StatusChip, {
        inputs: { tone: 'danger', label: 'Off track' },
        providers,
      });

      const host = container as HTMLElement;
      expect(host.classList.contains('tone-danger')).toBe(true);
      expect(screen.getByText('Off track')).toBeTruthy();
      expect(host.querySelector('mat-icon')?.getAttribute('data-mat-icon-name')).toBe('error');
    });

    it('accepts a custom icon and defaults to neutral', async () => {
      const { container } = await render(StatusChip, {
        inputs: { label: 'Draft', icon: 'schedule' },
        providers,
      });

      expect((container as HTMLElement).classList.contains('tone-neutral')).toBe(true);
    });
  });
});
