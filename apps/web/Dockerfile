ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .

RUN pnpm --filter @feishu-timeline/web build

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PATH="/app/node_modules/.bin:${PATH}"

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/apps/web /app/apps/web

WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=20s \
  CMD node -e "require('node:http').get('http://127.0.0.1:3000/login',(response)=>process.exit(response.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node

CMD ["sh", "-c", "exec /app/apps/web/node_modules/.bin/next start --hostname 0.0.0.0 --port 3000"]
