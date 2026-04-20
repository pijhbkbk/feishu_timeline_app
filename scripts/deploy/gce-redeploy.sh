#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_PRISMA_MIGRATE_DEPLOY="${RUN_PRISMA_MIGRATE_DEPLOY:-no}"
RUN_POSTCUTOVER_HARDENING="${RUN_POSTCUTOVER_HARDENING:-no}"
RUN_SECURITY_HARDENING="${RUN_SECURITY_HARDENING:-no}"
RUN_RELEASE_VERIFY="${RUN_RELEASE_VERIFY:-yes}"
RUN_PRODUCTION_ACCEPTANCE="${RUN_PRODUCTION_ACCEPTANCE:-yes}"

log() {
  printf '[INFO] %s\n' "$*"
}

log "Redeploying current Git ref to GCE"
RUN_PRISMA_MIGRATE_DEPLOY="$RUN_PRISMA_MIGRATE_DEPLOY" \
  bash "$ROOT_DIR/scripts/deploy/gce-sync-and-build.sh"

if [ "$RUN_POSTCUTOVER_HARDENING" = "yes" ]; then
  log "Running post-cutover hardening"
  bash "$ROOT_DIR/scripts/deploy/gce-postcutover-hardening.sh"
fi

if [ "$RUN_SECURITY_HARDENING" = "yes" ]; then
  log "Running security hardening"
  bash "$ROOT_DIR/scripts/deploy/gce-security-hardening.sh"
fi

if [ "$RUN_RELEASE_VERIFY" = "yes" ]; then
  log "Running release verification"
  bash "$ROOT_DIR/scripts/deploy/gce-release-verify.sh"
fi

if [ "$RUN_PRODUCTION_ACCEPTANCE" = "yes" ]; then
  log "Running production acceptance"
  bash "$ROOT_DIR/scripts/deploy/gce-production-acceptance.sh"
fi
