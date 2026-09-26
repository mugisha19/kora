import { Component, model } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Show/hide button for a password field (use with `matSuffix`). It is a toggle button: the label
 * stays "Show password" and `aria-pressed` says whether it is on, which is how screen readers
 * expect a toggle to behave.
 */
@Component({
  selector: 'kora-password-toggle',
  imports: [MatIconButton, MatIcon, TranslocoPipe],
  template: `
    <button
      mat-icon-button
      type="button"
      [attr.aria-pressed]="visible()"
      [attr.aria-label]="'auth.showPassword' | transloco"
      (click)="visible.set(!visible())"
    >
      <mat-icon [svgIcon]="visible() ? 'visibility_off' : 'visibility'" aria-hidden="true" />
    </button>
  `,
})
export class PasswordToggle {
  readonly visible = model(false);
}
