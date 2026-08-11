#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'SAST target discovery requires a Git worktree.\n' >&2
  exit 2
fi

is_excluded_path() {
  local path="$1"

  if [[ "$path" =~ (^|/)(node_modules|\.next|dist|build|coverage|generated|__generated__|playwright-report|test-results)(/|$) ]]; then
    return 0
  fi

  case "$path" in
    *.tsbuildinfo|*/next-env.d.ts)
      return 0
      ;;
  esac

  return 1
}

is_approved_first_party_path() {
  local path="$1"

  case "$path" in
    apps/web/*|apps/api/*|apps/api-ops/*|packages/shared/*|deploy/*|scripts/*|.github/workflows/*)
      return 0
      ;;
    eslint.config.mjs|tsconfig*.json)
      return 0
      ;;
  esac

  return 1
}

is_authored_source_or_config() {
  local path="$1"

  case "$path" in
    .github/workflows/*.yml|.github/workflows/*.yaml)
      # CI workflow YAML is executable pipeline configuration and belongs in
      # the formal first-party SAST target manifest.
      return 0
      ;;
    *.sh|*.js|*.jsx|*.mjs|*.cjs|*.ts|*.tsx|*.mts|*.cts|*.py)
      return 0
      ;;
    tsconfig*.json|*/tsconfig*.json)
      return 0
      ;;
  esac

  return 1
}

# Dockerfiles and Prisma schemas remain mandatory company source-package
# inputs, but are intentionally not claimed here as Semgrep targets until
# pinned language-specific rules are approved. Image/config checks and
# prisma:validate provide their separate gates.

while IFS= read -r -d '' path; do
  if is_excluded_path "$path"; then
    continue
  fi
  if is_approved_first_party_path "$path" && is_authored_source_or_config "$path"; then
    printf '%s\n' "$path"
  fi
done < <(git ls-files --cached --others --exclude-standard -z)
