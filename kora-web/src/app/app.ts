import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root component: everything visible is rendered by routes (the shell, later the auth layout). */
@Component({
  selector: 'kora-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
