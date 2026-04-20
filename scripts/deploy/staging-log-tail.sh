#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker

load_compose_env
load_release_state_if_present

TAIL_LINES="${TAIL_LINES:-100}"

if [[ "$#" -gt 0 ]]; then
  compose logs -f --tail="$TAIL_LINES" "$@"
else
  compose logs -f --tail="$TAIL_LINES" postgres redis api web nginx
fi

