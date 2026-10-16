#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
GCE_TUNNEL_THROUGH_IAP="${GCE_TUNNEL_THROUGH_IAP:-no}"

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

validate_gce_connection_parameters() {
  if [ "${#INSTANCE}" -gt 63 ] \
    || [[ ! "$INSTANCE" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    fail 'INSTANCE must be a 1-63 character lowercase RFC 1035 name.'
  fi

  if [ "${#PROJECT}" -lt 6 ] || [ "${#PROJECT}" -gt 30 ] \
    || [[ ! "$PROJECT" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]]; then
    fail 'PROJECT must be a 6-30 character lowercase Google Cloud project id.'
  fi

  if [ "${#ZONE}" -gt 63 ] || [[ "$ZONE" != *-* ]] \
    || [[ ! "$ZONE" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    fail 'ZONE must be a lowercase Google Cloud zone name no longer than 63 characters.'
  fi

  case "$GCE_TUNNEL_THROUGH_IAP" in
    yes|no)
      ;;
    *)
      fail 'GCE_TUNNEL_THROUGH_IAP must be yes or no.'
      ;;
  esac
}

quote_remote_argument() {
  local value="$1"

  case "$value" in
    *$'\n'*|*$'\r'*)
      fail 'A remote positional argument contains a prohibited control character.'
      ;;
  esac

  printf "'%s'" "${value//\'/\'\"\'\"\'}"
}

gce_ssh() {
  local command="$1"
  local -a args=(compute ssh "$INSTANCE" "--project=$PROJECT" "--zone=$ZONE")

  validate_gce_connection_parameters
  if [ "$GCE_TUNNEL_THROUGH_IAP" = "yes" ]; then
    args+=(--tunnel-through-iap)
  fi

  args+=(--command "$command")
  gcloud "${args[@]}"
}

gce_scp_to_remote() {
  local source_path="$1"
  local remote_path="$2"
  local -a args=(compute scp "$source_path" "$INSTANCE:$remote_path" "--project=$PROJECT" "--zone=$ZONE")

  validate_gce_connection_parameters
  if [ "$GCE_TUNNEL_THROUGH_IAP" = "yes" ]; then
    args+=(--tunnel-through-iap)
  fi

  gcloud "${args[@]}"
}

gce_run_remote_script() {
  local source_path="$1"
  local remote_path
  local status=0

  remote_path="/tmp/$(basename "$source_path").$$"

  gce_scp_to_remote "$source_path" "$remote_path"
  gce_ssh "bash $(quote_remote_argument "$remote_path")" || status=$?
  gce_ssh "rm -f -- $(quote_remote_argument "$remote_path")" >/dev/null 2>&1 || true

  return "$status"
}

gce_run_remote_script_with_args() {
  local source_path="$1"
  local remote_path
  local remote_command
  local argument
  local status=0

  remote_path="/tmp/$(basename "$source_path").$$"
  shift
  remote_command="bash $(quote_remote_argument "$remote_path")"
  for argument in "$@"; do
    remote_command+=" $(quote_remote_argument "$argument")"
  done

  gce_scp_to_remote "$source_path" "$remote_path"
  gce_ssh "$remote_command" || status=$?
  gce_ssh "rm -f -- $(quote_remote_argument "$remote_path")" >/dev/null 2>&1 || true

  return "$status"
}
