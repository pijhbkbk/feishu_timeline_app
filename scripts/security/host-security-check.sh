#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/host"
DOC_REPORT="$ROOT_DIR/docs/security/PRIVATE_CLOUD_SECURITY_R19.md"
export ROOT_DIR
cd "$ROOT_DIR"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
raw="$REPORT_DIR/host-security.raw.txt"
: >"$raw"

capture() {
  local title="$1"
  shift
  {
    printf '\n===== %s =====\n' "$title"
    "$@" 2>&1 || true
  } >>"$raw"
}

capture "hostname" hostname
capture "os-release" sh -c 'cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || true'
capture "kernel" uname -a
capture "uptime" uptime
capture "listening ports" sh -c 'ss -tlnp 2>/dev/null || netstat -anv -p tcp 2>/dev/null || true'
capture "ssh effective config" sh -c 'sshd -T 2>/dev/null | egrep "permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|maxauthtries|logingracetime" || true'
capture "sudo users" sh -c 'getent group sudo 2>/dev/null || dscl . -read /Groups/admin GroupMembership 2>/dev/null || true'
capture "systemd services" sh -c 'for service in nginx feishu-timeline-api feishu-timeline-web postgresql redis-server; do systemctl is-active "$service" 2>/dev/null || true; done'
capture "env file permissions" sh -c 'find . apps deploy -maxdepth 4 -type f \( -name ".env" -o -name ".env.*" -o -path "deploy/env/*" \) -exec ls -l {} \; 2>/dev/null || true'
capture "nginx config hints" sh -c 'nginx -T 2>/dev/null | egrep -i "server_tokens|ssl_protocols|strict-transport-security|client_max_body_size|autoindex|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy" || true'
capture "postgres pg_hba hints" sh -c 'find /etc /var/lib/postgresql -name pg_hba.conf -maxdepth 5 -print -exec sed -n "1,220p" {} \; 2>/dev/null || true'
capture "redis config hints" sh -c 'find /etc -name "redis*.conf" -maxdepth 5 -print -exec egrep -i "^(bind|protected-mode|requirepass)" {} \; 2>/dev/null || true'
capture "logrotate" sh -c 'ls -la /etc/logrotate.d 2>/dev/null || true'
capture "backup hints" sh -c 'find /var/backups "$ROOT_DIR" -maxdepth 4 -type f 2>/dev/null | egrep -i "backup|dump|sql|tar|gz" | head -n 100 || true'

cat >"$DOC_REPORT" <<EOF
# Private Cloud Security R19

Generated: $timestamp
Commit: $commit
Host: $(hostname 2>/dev/null || printf 'unknown')

## Raw Output

See `reports/security/host/host-security.raw.txt`.

## Review Checklist

- SSH root login must be disabled.
- SSH password login must be disabled.
- Only 80 / 443 / necessary SSH port should be public.
- PostgreSQL must not listen on public interfaces.
- Redis must not listen on public interfaces.
- API and Web services should run as non-root users.
- `.env.production` permissions must be `600` or stricter.
- Nginx must enable HTTPS, HSTS and baseline security headers.
- Backups and restore drills must be documented.
- Logs must not contain secrets.

## Current Acceptance

FAIL until the target VPS/private cloud host output is reviewed and Critical / High findings are fixed.
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
