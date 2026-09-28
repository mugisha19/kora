# syntax=docker/dockerfile:1
# The Kora web image (Phase 10): the Angular app served by Nginx, which also proxies /api and /ws to the API.
# Build from kora-web/:  docker build -t kora-web .
# Tests are not run here: CI runs lint, unit and e2e tests before it builds the image.

# ---- build: install exactly the locked dependencies and make the production bundle -----------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# No install scripts: the Git hooks (Husky) and optional native addons aren't needed to build.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public/ public/
COPY src/ src/
RUN npx ng build --configuration production

# ---- runtime: unprivileged Nginx (listens on 8080, runs as a non-root user) ---------------------------------------
FROM nginxinc/nginx-unprivileged:1.31-alpine
# Where the API is (host:port on the container network) and where browsers upload and download files (allowed by
# the Content-Security-Policy). The Nginx entrypoint writes them into the templates when the container starts.
ENV KORA_API_UPSTREAM=api:8080 \
    KORA_STORAGE_ORIGIN=http://localhost:8333
COPY nginx/templates/ /etc/nginx/templates/
COPY --from=build /app/dist/kora-web/browser/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/healthz > /dev/null || exit 1
