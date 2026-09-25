import { DestroyRef, Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject, of, switchMap } from 'rxjs';

export const APP_TITLE = 'Kora';

/**
 * Route `title`s are translation keys. The document title is "<translated page> · Kora" and is
 * re-translated when the language changes, so screen-reader users hear the page name in their language.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly titleKey = new BehaviorSubject<string | undefined>(undefined);

  constructor() {
    super();
    const subscription = this.titleKey
      .pipe(switchMap((key) => (key ? this.transloco.selectTranslate<string>(key) : of(null))))
      .subscribe((page) => this.title.setTitle(page ? `${page} · ${APP_TITLE}` : APP_TITLE));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.titleKey.next(this.buildTitle(snapshot));
  }
}
