import { render, screen } from '@testing-library/angular';
import { App } from './app';

describe('App', () => {
  it('renders the product heading', async () => {
    await render(App);

    expect(screen.getByRole('heading', { level: 1, name: 'Kora' })).toBeTruthy();
  });
});
