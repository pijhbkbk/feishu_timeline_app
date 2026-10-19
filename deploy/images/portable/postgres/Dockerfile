# Portable-only derived image; the existing staging profile is unchanged.
ARG POSTGRES_BASE_IMAGE=postgres:14.24-alpine@sha256:3b36dd7df1337107cef7502b1e3e94c971483ae87498a9310d25c60fba08cfc9
FROM ${POSTGRES_BASE_IMAGE}

ARG BUILD_SOURCE_COMMIT
ARG BUILD_SOURCE_TREE
ARG BUILD_RELEASE
ARG BUILD_TIME

LABEL org.opencontainers.image.revision="${BUILD_SOURCE_COMMIT}" \
  org.opencontainers.image.version="${BUILD_RELEASE}" \
  org.opencontainers.image.created="${BUILD_TIME}" \
  com.feishu-timeline.source-tree="${BUILD_SOURCE_TREE}" \
  com.feishu-timeline.portable-security-revision="20261019"

# Exact signed Alpine package revisions; missing versions fail the build.
RUN apk add --no-cache libcrypto3=3.5.9-r0 libssl3=3.5.9-r0 libuuid=2.42.3-r1 zlib=1.3.2-r1

# The portable profile starts PostgreSQL as its own UID, so no root-to-user
# helper is needed. This follows deploy/images/postgres/Dockerfile while
# retaining PostgreSQL 14 and its data format. Fresh-volume install/restore
# must be verified; never apply this image to an existing instance implicitly.
RUN rm -f /usr/local/bin/gosu

USER postgres
