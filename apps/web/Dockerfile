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

ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_ENABLE_MOCK_LOGIN
ARG NEXT_PUBLIC_UI_VERSION
ARG NEXT_PUBLIC_UI_DATA_MODE
ARG V1_FALLBACK_ENABLED
ARG NEXT_PUBLIC_R26_V2_PROTOTYPE
ARG NEXT_PUBLIC_R26_V2_DATA_MODE

ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_ENABLE_MOCK_LOGIN=${NEXT_PUBLIC_ENABLE_MOCK_LOGIN}
ENV NEXT_PUBLIC_UI_VERSION=${NEXT_PUBLIC_UI_VERSION}
ENV NEXT_PUBLIC_UI_DATA_MODE=${NEXT_PUBLIC_UI_DATA_MODE}
ENV V1_FALLBACK_ENABLED=${V1_FALLBACK_ENABLED}
ENV NEXT_PUBLIC_R26_V2_PROTOTYPE=${NEXT_PUBLIC_R26_V2_PROTOTYPE}
ENV NEXT_PUBLIC_R26_V2_DATA_MODE=${NEXT_PUBLIC_R26_V2_DATA_MODE}

COPY . .

RUN pnpm --filter @feishu-timeline/web build

FROM build AS web-runtime-bundle

RUN find /app/apps/web/.next/standalone/node_modules/.pnpm \
    -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-linux-*@*' \
    -exec rm -rf {} + \
  && find /app/apps/web/.next/standalone \
    -path '*/node_modules/@img/sharp-linux-*' -delete

FROM web-runtime-bundle AS web-native-runtime

RUN set -eu; \
  libvips_dir="$(find /app/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-libvips-linuxmusl-*' -print -quit)"; \
  test -n "$libvips_dir"; \
  mkdir -p /out; \
  cp -a "$libvips_dir" /out/

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ARG V1_FALLBACK_ENABLED=true
ENV V1_FALLBACK_ENABLED=${V1_FALLBACK_ENABLED}

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=web-runtime-bundle --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public /app/apps/web/public
COPY --from=web-native-runtime --chown=node:node /out/ /app/node_modules/.pnpm/
COPY --chown=node:node THIRD_PARTY_NOTICES /usr/share/doc/feishu-timeline/THIRD_PARTY_NOTICES

RUN set -eu; \
  libvips_dir="$(find /app/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-libvips-linuxmusl-*' -print -quit)"; \
  sharp_dir="$(find /app/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name 'sharp@*' -print -quit)"; \
  package_dir="$(find "$libvips_dir/node_modules/@img" -mindepth 1 -maxdepth 1 -type d -print -quit)"; \
  package_name="${package_dir##*/}"; \
  sharp_native_package="sharp-${package_name#sharp-libvips-}"; \
  sharp_native_dir="$(find /app/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name "@img+${sharp_native_package}@*" -print -quit)"; \
  test -n "$libvips_dir"; \
  test -n "$sharp_dir"; \
  test -n "$sharp_native_dir"; \
  test -n "$package_dir"; \
  ln -s "../../../${libvips_dir##*/}/node_modules/@img/${package_dir##*/}" \
    "$sharp_dir/node_modules/@img/${package_dir##*/}"; \
  ln -s "../../../${libvips_dir##*/}/node_modules/@img/${package_dir##*/}" \
    "$sharp_native_dir/node_modules/@img/${package_dir##*/}"; \
  chown -h node:node \
    "$sharp_dir/node_modules/@img/${package_dir##*/}" \
    "$sharp_native_dir/node_modules/@img/${package_dir##*/}"

WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=20s \
  CMD node -e "require('node:http').get('http://127.0.0.1:3000/login',(response)=>process.exit(response.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node

CMD ["node", "server.js"]
