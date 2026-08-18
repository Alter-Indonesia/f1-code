# Self-hosted apps/web image. Build from the REPO ROOT (workspace deps need
# the whole monorepo context), not from apps/web:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_T3CODE_RELAY_URL=https://relay-f1code.alterindonesia.com \
#     --build-arg VITE_ALTER_OIDC_ISSUER=https://one.alterindonesia.com \
#     --build-arg VITE_ALTER_OIDC_CLIENT_ID=... \
#     --build-arg VITE_ALTER_OIDC_REDIRECT_URI=https://f1code.alterindonesia.com/oauth/callback \
#     -t f1code-web .
#
# apps/web is a plain static Vite SPA (vite.config.ts -> dist/, no SSR) — the
# runtime stage is just nginx serving static files. Vite's cloud config
# (apps/web/src/cloud/publicConfig.ts) reads VITE_* vars via import.meta.env
# at BUILD time, so they have to be build args here, not container env vars.
FROM node:24-slim AS build

# git: the workspace root `prepare` script (effect-tsgo patch, etc.) shells
# out to git during `pnpm install` — same as infra/relay/Dockerfile.
# ca-certificates: vite-plus's Rust HTTP client can't load any root certs on
# a bare node:24-slim otherwise ("No CA certificates were loaded from the
# system"), which crashes `vp build`.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @t3tools/web...

ARG VITE_T3CODE_RELAY_URL
ARG VITE_ALTER_OIDC_ISSUER
ARG VITE_ALTER_OIDC_CLIENT_ID
ARG VITE_ALTER_OIDC_REDIRECT_URI
ENV VITE_T3CODE_RELAY_URL=$VITE_T3CODE_RELAY_URL \
    VITE_ALTER_OIDC_ISSUER=$VITE_ALTER_OIDC_ISSUER \
    VITE_ALTER_OIDC_CLIENT_ID=$VITE_ALTER_OIDC_CLIENT_ID \
    VITE_ALTER_OIDC_REDIRECT_URI=$VITE_ALTER_OIDC_REDIRECT_URI

WORKDIR /repo/apps/web
RUN pnpm run build

FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# SPA fallback: unknown paths (client-side routes) serve index.html instead
# of nginx's default 404.
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
