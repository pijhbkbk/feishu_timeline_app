ARG POSTGRES_BASE_IMAGE=postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
FROM ${POSTGRES_BASE_IMAGE}

# The upstream image starts as root and ships gosu for its one-time privilege
# drop. Staging always runs PostgreSQL directly as the dedicated postgres user,
# so the helper is unnecessary runtime attack surface. Removing it also avoids
# carrying the Go standard-library CVEs embedded in the current upstream binary.
RUN rm -f /usr/local/bin/gosu

USER postgres
