import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * `<mat-icon svgIcon="name">` resolves to the self-hosted `icons/<name>.svg` (copied from Material
 * Symbols by `npm run icons`). Icons load on first use and are cached by the registry.
 */
export function provideIcons(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    registry.addSvgIconResolver((name, namespace) =>
      namespace ? null : sanitizer.bypassSecurityTrustResourceUrl(`icons/${name}.svg`),
    );
  });
}
