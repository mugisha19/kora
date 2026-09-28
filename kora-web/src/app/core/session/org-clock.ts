import { Injectable, inject } from '@angular/core';
import { OrgDirectory } from '../people/org-directory';
import { NOW } from './clock';

/**
 * Today as the organization sees it (`yyyy-mm-dd` in its time zone), as the API counts the current
 * week and overdue dates; the browser's own time zone until the organization has loaded.
 */
@Injectable({ providedIn: 'root' })
export class OrgClock {
  private readonly directory = inject(OrgDirectory);
  private readonly now = inject(NOW);

  today(): string {
    const timeZone = this.directory.timeZone() ?? undefined;
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(this.now()));
  }
}
