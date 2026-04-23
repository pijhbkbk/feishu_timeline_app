#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_gcloud() {
  require_command gcloud
}

gce_ssh() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

gce_scp_to_remote() {
  local source_path="$1"
  local remote_path="$2"

  gcloud compute scp "$source_path" "$INSTANCE:$remote_path" --project="$PROJECT" --zone="$ZONE"
}

gce_run_remote_script() {
  local source_path="$1"
  local remote_path="${2:-/tmp/$(basename "$source_path").$$}"
  local status=0

  gce_scp_to_remote "$source_path" "$remote_path"
  gce_ssh "bash '$remote_path'" || status=$?
  gce_ssh "rm -f '$remote_path'" >/dev/null 2>&1 || true

  return "$status"
}
