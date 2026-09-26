import { Injectable, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@jsverse/transloco';

/** Material paginator labels in the active language, updated when the language changes. */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    // Emits once the active language's file is loaded, and again on every language change.
    // The service lives as long as the app, so the subscription is never torn down.
    this.transloco.selectTranslate('paginator.itemsPerPage').subscribe(() => this.relabel());
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return this.transloco.translate('paginator.rangeEmpty', { total: length });
    }
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, length);
    return this.transloco.translate('paginator.range', { start, end, total: length });
  };

  private relabel(): void {
    const t = (key: string) => this.transloco.translate(`paginator.${key}`);
    this.itemsPerPageLabel = t('itemsPerPage');
    this.nextPageLabel = t('nextPage');
    this.previousPageLabel = t('previousPage');
    this.firstPageLabel = t('firstPage');
    this.lastPageLabel = t('lastPage');
    this.changes.next();
  }
}
