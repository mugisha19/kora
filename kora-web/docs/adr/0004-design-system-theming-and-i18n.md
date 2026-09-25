# 0004 — Design system: Material 3 with `light-dark()` tokens, Transloco for i18n

- Status: Accepted
- Date: 2026-09-25

## Context

Feature 23 requires light, dark and system themes that switch instantly and are remembered per
device, a high-contrast palette under `prefers-contrast: more`, respect for reduced motion, and a
runtime language switch between English, French and Kinyarwanda that also updates the page title
and `<html lang>`. Every screen must meet WCAG 2.1 AA, and status must never be shown by colour alone.

## Decision

- **One Material 3 theme with `theme-type: color-scheme`.** Material emits every system token as
  `light-dark(<light>, <dark>)`, so one stylesheet serves both schemes. `ThemeService` only sets
  `data-theme="light|dark"` on `<html>` (CSS maps it to `color-scheme`); "system" removes it.
  No second theme is generated, and switching costs no style recalculation beyond the custom properties.
- **High contrast** is `mat.theme-overrides` inside `@media (prefers-contrast: more)`: darker
  outlines and on-surface-variant text, a stronger primary. **Strong focus indicators** are on for
  all Material components.
- **Kora tokens** (`src/styles/_tokens.scss`) add what Material lacks: spacing scale and five
  status tones (success, warning, danger, info, neutral), each a `light-dark()` foreground and
  background pair with ≥ 7:1 contrast. `StatusChip` always pairs a tone with a distinct icon shape
  and text.
- **System font stack** instead of a web font: no extra request, no layout shift, and native
  glyph coverage for French and Kinyarwanda.
- **Reduced motion:** `MATERIAL_ANIMATIONS` is disabled when the OS asks for it, and a global
  rule shortens any remaining CSS animation.
- **Transloco** for runtime i18n: JSON files in `public/i18n`, lazy-loaded per language. Start-up
  waits for the first language file so no raw keys flash. Language order: device choice →
  profile locale (Phase 3) → browser → English. A `TitleStrategy` translates route titles and
  re-translates on language change. A **parity unit test** fails the build when fr or rw miss a
  key, have an empty string or drop a `{{ placeholder }}`.
- **Focus management:** after each navigation, focus moves to the new page's `<h1>` (which is
  `tabindex="-1"`). The skip link focuses it directly, because `href="#main"` would navigate to `/`
  in a router app.

## Alternatives considered

- **Two compiled themes toggled by a class** — the classic M2 approach; duplicates every token and
  makes "system" require JavaScript listeners. `light-dark()` is supported by all evergreen browsers.
- **Angular's built-in i18n (`$localize`)** — compile-time, one build per language, and switching
  language needs a full reload. The spec asks for an instant runtime switch.
- **ngx-translate** — similar model, but Transloco has signal APIs, scoped lazy loading and a
  maintained testing module.
- **Tailwind** — fast to style, but duplicates Material's token system and fights component styles.

## Consequences

- Browsers without `light-dark()` (released before 2024) are not supported; the tokens would be
  invalid there. Acceptable for a business web app targeting evergreen browsers.
- Kinyarwanda strings are best-effort until reviewed by a native speaker (tracked in feature 23).
- Every new string needs three translations in the same commit, or the parity test fails.
