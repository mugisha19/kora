import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { provideTestUi } from '../testing/test-providers';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  it('renders the shell and redirects to the dashboard', async () => {
    const { navigate } = await render(App, {
      providers: [...provideTestUi(), provideRouter(routes)],
    });

    await navigate('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  });

  it('shows the not-found page for unknown URLs', async () => {
    const { navigate } = await render(App, {
      providers: [...provideTestUi(), provideRouter(routes)],
    });

    await navigate('/nowhere');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  });
});
