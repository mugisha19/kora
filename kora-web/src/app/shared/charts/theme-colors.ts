/**
 * A CSS colour token's value in a colour scheme. The tokens use `light-dark()`, which only
 * resolves on an element, so a hidden probe with that scheme reads it. Charts need real colours:
 * ECharts draws on a canvas, not with CSS.
 */
export function themeColor(token: string, scheme: 'light' | 'dark'): string {
  const probe = document.createElement('span');
  probe.style.colorScheme = scheme;
  probe.style.color = `var(${token})`;
  probe.style.display = 'none';
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** Whether charts should animate (not when the user asked for reduced motion). */
export function chartAnimation(): boolean {
  return (
    typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
