import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component. Phase 0 renders only a landing heading; the application shell (toolbar,
 * navigation, theme and language) arrives in Phase 1.
 */
@Component({
  selector: 'kora-root',
  imports: [RouterOutlet],
  template: `
    <main class="landing">
      <h1>Kora</h1>
      <p>Project and portfolio management, built on PMI practice.</p>
    </main>
    <router-outlet />
  `,
  styles: `
    .landing {
      display: grid;
      place-content: center;
      min-block-size: 100dvh;
      padding: 1rem;
      text-align: center;
    }
  `,
})
export class App {}
