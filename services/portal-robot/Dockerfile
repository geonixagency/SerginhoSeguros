# Build a partir da raiz do monorepo: docker build -f services/portal-robot/Dockerfile .
# A imagem oficial do Playwright já traz o Chromium e as libs de sistema necessárias.
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests de todos os pacotes para o lockfile bater (--frozen-lockfile).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/import/package.json scripts/import/
COPY services/portal-robot/package.json services/portal-robot/
RUN pnpm install --frozen-lockfile --filter "@ss/portal-robot..."
COPY services/portal-robot services/portal-robot
RUN pnpm --filter @ss/portal-robot build

FROM mcr.microsoft.com/playwright:v1.56.1-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Só o necessário para rodar: bundle + node_modules de produção do serviço.
COPY --from=build /repo/services/portal-robot/dist ./dist
COPY --from=build /repo/services/portal-robot/node_modules ./node_modules
COPY --from=build /repo/services/portal-robot/package.json ./package.json
RUN mkdir -p /profiles && chown -R pwuser /profiles
USER pwuser
EXPOSE 8020
CMD ["node", "dist/server.js"]
