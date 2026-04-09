#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
NODE_MAJOR="${NODE_MAJOR:-24}"
PNPM_VERSION="${PNPM_VERSION:-9.15.4}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"

log() {
  printf '[INFO] %s\n' "$*"
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

REMOTE_USER="$(ssh_gce 'whoami')"
log "Remote user: $REMOTE_USER"

ssh_gce "set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx build-essential postgresql-client

current_major=0
if command -v node >/dev/null 2>&1; then
  current_major=\$(node -p \"process.versions.node.split('.')[0]\")
fi

if [ \"\$current_major\" -lt $NODE_MAJOR ]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo corepack enable
mkdir -p /home/$REMOTE_USER/.cache/node/corepack
env HOME=/home/$REMOTE_USER COREPACK_HOME=/home/$REMOTE_USER/.cache/node/corepack PATH=/usr/local/bin:/usr/bin:/bin corepack prepare pnpm@$PNPM_VERSION --activate

sudo mkdir -p '$APP_ROOT'
sudo mkdir -p '$APP_ROOT/var/object-storage'
sudo chown -R '$REMOTE_USER:$REMOTE_USER' '$APP_ROOT'

printf 'remote_user=%s\n' '$REMOTE_USER'
printf 'node=%s\n' \"\$(node -v)\"
printf 'pnpm=%s\n' \"\$(env HOME=/home/$REMOTE_USER COREPACK_HOME=/home/$REMOTE_USER/.cache/node/corepack PATH=/usr/local/bin:/usr/bin:/bin pnpm -v)\"
printf 'git=%s\n' \"\$(git --version)\"
printf 'nginx=%s\n' \"\$(nginx -v 2>&1)\"
ls -ld '$APP_ROOT' '$APP_ROOT/var/object-storage'
"
