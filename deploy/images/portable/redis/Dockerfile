# Portable-only derived image; the existing staging profile is unchanged.
ARG REDIS_BASE_IMAGE=redis:7.4.9-alpine@sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7
FROM ${REDIS_BASE_IMAGE}

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
RUN apk add --no-cache libcrypto3=3.3.7-r2 libssl3=3.3.7-r2 zlib=1.3.2-r1
