import { UrlMatcher, UrlSegment } from '@angular/router';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Matches `:param` only when it is a UUID (and, with `suffix`, exactly `:param/suffix`), so other
 * words (`/projects/new` for someone who can't create) fall through to "page not found" instead of
 * loading a detail page for an id that can't exist.
 */
export function uuidParam(param: string, suffix?: string): UrlMatcher {
  return (segments: UrlSegment[]) => {
    const [id, next] = segments;
    if (!id || !UUID.test(id.path)) return null;
    if (suffix === undefined) return { consumed: [id], posParams: { [param]: id } };
    return segments.length === 2 && next.path === suffix
      ? { consumed: segments, posParams: { [param]: id } }
      : null;
  };
}
