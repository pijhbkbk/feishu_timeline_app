#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
RUN_POSTCUTOVER_HARDENING="${RUN_POSTCUTOVER_HARDENING:-yes}"
INSTALL_FAIL2BAN="${INSTALL_FAIL2BAN:-yes}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

log() {
  printf '[INFO] %s\n' "$*"
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

if [ "$RUN_POSTCUTOVER_HARDENING" = "yes" ]; then
  log "Re-applying post-cutover Nginx hardening"
  bash "$ROOT_DIR/scripts/deploy/gce-postcutover-hardening.sh"
fi

log "Applying SSH, systemd and host-level hardening on $INSTANCE"
ssh_gce "set -euo pipefail
backup_dir=\"/var/backups/feishu-timeline-security/\$(date -u +%Y%m%dT%H%M%SZ)\"
sudo mkdir -p \"\$backup_dir\"

backup_if_exists() {
  local source=\"\$1\"
  local target=\"\$2\"
  if [ -e \"\$source\" ]; then
    sudo cp -a \"\$source\" \"\$backup_dir/\$target\"
  fi
}

backup_if_exists /etc/ssh/sshd_config.d/99-feishu-hardening.conf sshd_config.d.99-feishu-hardening.conf.bak
backup_if_exists /etc/fail2ban/jail.d/sshd.local fail2ban.sshd.local.bak
backup_if_exists /etc/systemd/system/feishu-timeline-api.service.d/10-hardening.conf api.service.d.10-hardening.conf.bak
backup_if_exists /etc/systemd/system/feishu-timeline-web.service.d/10-hardening.conf web.service.d.10-hardening.conf.bak

APP_USER=\"\$(systemctl show -p User --value feishu-timeline-web)\"
[ -n \"\$APP_USER\" ] || APP_USER=\"\$(whoami)\"

sudo mkdir -p /etc/ssh/sshd_config.d
cat <<'EOF' | sudo tee /etc/ssh/sshd_config.d/99-feishu-hardening.conf >/dev/null
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
EOF

sudo sshd -t
sudo systemctl reload ssh

if [ '$INSTALL_FAIL2BAN' = 'yes' ]; then
  sudo apt-get update
  sudo apt-get install -y fail2ban
  sudo mkdir -p /etc/fail2ban/jail.d
  cat <<'EOF' | sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null
[sshd]
enabled = true
backend = systemd
port = ssh
maxretry = 5
findtime = 10m
bantime = 1h
EOF
  sudo systemctl enable fail2ban
  sudo systemctl restart fail2ban
fi

sudo mkdir -p /etc/systemd/system/feishu-timeline-api.service.d
cat <<'EOF' | sudo tee /etc/systemd/system/feishu-timeline-api.service.d/10-hardening.conf >/dev/null
[Service]
PrivateDevices=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectHostname=true
ProtectSystem=full
ReadWritePaths=/opt/feishu_timeline_app/var/object-storage
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=true
EOF

sudo mkdir -p /etc/systemd/system/feishu-timeline-web.service.d
cat <<EOF | sudo tee /etc/systemd/system/feishu-timeline-web.service.d/10-hardening.conf >/dev/null
[Service]
PrivateDevices=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectHostname=true
ProtectSystem=full
ReadWritePaths=/home/\${APP_USER}/.cache/node/corepack
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=true
EOF

sudo systemctl daemon-reload
sudo systemctl restart feishu-timeline-api
sudo systemctl restart feishu-timeline-web

sudo nginx -t >/dev/null
systemctl is-active feishu-timeline-api
systemctl is-active feishu-timeline-web
systemctl is-active nginx
if systemctl list-unit-files | grep -q '^fail2ban.service'; then
  systemctl is-active fail2ban
fi
curl -fsS https://timeline.all-too-well.com/api/auth/session >/dev/null
curl -fsS https://timeline.all-too-well.com/api/auth/feishu/login-url >/dev/null
curl -k -I https://timeline.all-too-well.com | grep -i '^strict-transport-security:' >/dev/null
curl -k -I https://all-too-well.com | grep -i '^strict-transport-security:' >/dev/null
echo backup_dir=\$backup_dir
sudo sshd -T | egrep 'permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|maxauthtries|x11forwarding|allowagentforwarding|allowtcpforwarding|logingracetime'
"

