#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

printf '%s\n' \
  '[ERROR] Repository-controlled staging rollback is disabled. RC3 must supply an independently approved root-owned release controller using an approved immutable rollback manifest.' \
  >&2
exit 78
