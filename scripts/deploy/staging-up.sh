#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

printf '%s\n' \
  '[ERROR] Repository-controlled staging activation is disabled. RC3 must supply an independently approved root-owned release controller that consumes a validated release manifest and digest-pinned images.' \
  >&2
exit 78
