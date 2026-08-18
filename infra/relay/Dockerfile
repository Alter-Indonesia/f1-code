# Self-hosted relay image. Build from the REPO ROOT (workspace deps need the
# whole monorepo context), not from infra/relay:
#
#   docker build -f infra/relay/Dockerfile -t f1code-relay .
#
# Node 24 strips TypeScript types natively, so there's no separate compile
# step — the same way `infra/relay/scripts/deploy.ts` already runs directly.
# This copies the whole workspace rather than trying to hand-prune it with
# multi-stage copies — simpler to reason about and debug than pnpm's
# partial-install tricks, at the cost of a larger build context.
FROM node:24-slim

# git: the workspace root `prepare` script (effect-tsgo patch, etc.) shells
# out to git during `pnpm install`.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter t3code-relay...

ENV NODE_ENV=production
WORKDIR /repo/infra/relay
EXPOSE 8787
CMD ["node", "--", "src/server.ts"]
