#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

printf '%s\n' \
  '[ERROR] Repository-controlled rollback inspection is disabled. RC3 must supply an independently approved root-owned controller and immutable rollback manifest.' \
  >&2
exit 78
