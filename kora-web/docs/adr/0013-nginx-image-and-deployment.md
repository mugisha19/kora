# 0013 — Nginx image, security headers and the full-stack compose

- Status: Accepted
- Date: 2026-09-28

## Context

Phase 10 ships Kora: an image for the web app, one command that runs the whole stack, and the
security, caching and performance settings feature 24 asks for (CSP, HSTS, X-Frame-Options,
X-Content-Type-Options; Lighthouse ≥ 90; correlation ids end to end). The API already has its image
and a compose file with a `demo` profile; the browser must reach the API, its WebSocket and the
object storage without cross-origin surprises.

## Decision

- **One origin for the browser.** The web image is `nginxinc/nginx-unprivileged` (non-root, port 8080) serving the production build and proxying `/api/` and `/ws` (WebSocket upgrade, one-hour
  read timeout for STOMP heartbeats) to `KORA_API_UPSTREAM`. `/actuator` answers 404. Docker's DNS is
  re-resolved (`resolver 127.0.0.11` with a variable upstream), so Nginx starts before the API and
  follows it across restarts — no `depends_on` across compose files.
- **A strict CSP without unsafe scripts.** `script-src 'self'` only. Critical-CSS inlining is off in
  production (it needs an inline script); Angular's runtime `<style>` elements carry a per-response
  nonce: `index.html` has `ngCspNonce="NGINX_CSP_NONCE"`, which Nginx replaces with `$request_id`
  (`sub_filter`) and allows in `style-src-elem`. Inline style attributes stay allowed
  (`style-src-attr 'unsafe-inline'`: CDK overlays and charts position with them). The object
  storage origin (`KORA_STORAGE_ORIGIN`) is allowed for connections and images, because uploads
  and downloads go straight to it. Frames, objects, base and form targets are locked down.
- **Other headers** on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`, and HSTS only when a TLS proxy in front forwards
  `X-Forwarded-Proto: https` (never over plain HTTP). One included snippet sets them in every
  location, because an `add_header` in a location drops the inherited ones.
- **Caching.** Files with a content hash in their name are cached a year (`immutable`);
  `index.html` is revalidated on every visit (`no-cache`, which keeps the back/forward cache
  working); translations and icons revalidate. Text is gzipped.
- **Full stack in one command.** A root `compose.yaml` only includes `kora-api/compose.yaml` and
  `kora-web/compose.yaml`; `docker compose --profile demo up --build` runs PostgreSQL, Redis,
  Mailpit, SeaweedFS, the API with its demo data and the web on http://localhost:4200 (the port the
  API's email links and storage CORS rule expect).
- **CI.** The image is built after the checks pass, smoke-checked (health, CSP with `script-src
'self'`, a 32-hex nonce, a hidden actuator) and scanned with Trivy (fails on fixable critical
  vulnerabilities), on GitHub and GitLab like the API's image.
- **Start-up and tracing.** A device that never had a session skips the silent refresh at start-up
  (a non-secret `kora.signedIn` hint in localStorage; the refresh cookie is HttpOnly), so visitors
  see sign-in without waiting for a request that must fail. Every API request carries a 32-hex
  `X-Correlation-Id` also sent as W3C `traceparent`, so the id in an error message is the API's
  trace id.
- **Budget.** The initial bundle is ~700 kB raw / ~170 kB transferred; most of it is the framework
  and the form field every first page shows. The warning budget is 750 kB (error 900 kB); moving
  the form field out would only add a lazy chunk fetched at once.

## Consequences

- Lighthouse on the sign-in page, production image: desktop 99 performance, 100 accessibility,
  best practices and SEO; mobile (simulated slow CPU) 80 performance and 100 for the rest.
- The CSP was checked in a browser against the live API: charts, dialogs, live updates and a direct
  upload to storage produce no violations.
- Running the demo stack on a machine where the API's dev services already run needs those stopped
  first (same host ports).
- Deploying behind TLS needs a proxy that sets `X-Forwarded-Proto` (for HSTS) and a storage origin
  that matches `KORA_STORAGE_ORIGIN`.
