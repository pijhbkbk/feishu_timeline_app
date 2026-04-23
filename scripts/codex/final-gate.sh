#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

run() {
  echo
  echo "+ $*"
  "$@"
}

run pnpm install --frozen-lockfile
run pnpm lint
run pnpm typecheck
run pnpm test
run pnpm --filter @feishu-timeline/web build
run pnpm --filter @feishu-timeline/api build
run pnpm --filter @feishu-timeline/api prisma:validate
