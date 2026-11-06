# Build a partir da raiz do monorepo: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo

FROM base AS build
# Manifests de TODOS os pacotes do workspace para o lockfile bater (--frozen-lockfile),
# mas instalamos só as dependências da API.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/import/package.json scripts/import/
RUN pnpm install --frozen-lockfile --filter "@ss/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @ss/api exec prisma generate && pnpm --filter @ss/api build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
RUN mkdir -p /storage && chown -R node:node /storage
USER node
EXPOSE 3333
# Migrações são aplicadas no boot (prisma migrate deploy é idempotente).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
