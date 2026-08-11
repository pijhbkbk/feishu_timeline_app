ARG NODE_IMAGE=node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api-ops/package.json apps/api-ops/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .

RUN pnpm --filter @feishu-timeline/shared build \
  && pnpm --filter @feishu-timeline/api build

FROM build AS api-production-deps

RUN pnpm --filter @feishu-timeline/api deploy --prod --no-optional /out/api \
  && cd /out/api \
  && /app/apps/api/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM build AS api-ops-deps

RUN pnpm --filter @feishu-timeline/api-ops deploy --prod /out/api-ops \
  && mkdir -p /out/api-ops/prisma \
  && cp /app/apps/api/prisma/schema.prisma /out/api-ops/prisma/schema.prisma \
  && cd /out/api-ops \
  && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM ${NODE_IMAGE} AS ops

ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=api-ops-deps --chown=node:node /out/api-ops/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/api-ops/package.json /app/package.json
COPY --from=build --chown=node:node /app/apps/api/prisma /app/prisma
COPY --chown=node:node THIRD_PARTY_NOTICES /usr/share/doc/feishu-timeline/THIRD_PARTY_NOTICES

USER node

CMD ["./node_modules/.bin/prisma", "--help"]

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV OBJECT_STORAGE_LOCAL_ROOT=/app/var/object-storage

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=api-production-deps --chown=node:node /out/api/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json /app/package.json
COPY --from=build --chown=node:node /app/apps/api/dist /app/dist
COPY --chown=node:node THIRD_PARTY_NOTICES /usr/share/doc/feishu-timeline/THIRD_PARTY_NOTICES

RUN mkdir -p /app/var/object-storage \
  && chown node:node /app/var/object-storage

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=20s \
  CMD node -e "require('node:http').get('http://127.0.0.1:3001/api/health',(response)=>process.exit(response.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node

CMD ["node", "dist/main.js"]
