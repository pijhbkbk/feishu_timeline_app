#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME_DEFAULT="${DB_NAME_DEFAULT:-feishu_timeline}"
DB_USER_DEFAULT="${DB_USER_DEFAULT:-feishu_timeline_app}"
DB_SCHEMA="${DB_SCHEMA:-public}"
ROTATE_PLACEHOLDER_CREDENTIALS="${ROTATE_PLACEHOLDER_CREDENTIALS:-yes}"
RUN_PRISMA_MIGRATE_DEPLOY="${RUN_PRISMA_MIGRATE_DEPLOY:-yes}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_postgres_inputs() {
  validate_gce_connection_parameters

  if [ "${#APP_ROOT}" -gt 256 ] \
    || [[ ! "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$APP_ROOT" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'APP_ROOT must be an absolute normalized path containing only safe path characters.'
  fi
  if [ "${#DB_HOST}" -gt 253 ] \
    || [[ ! "$DB_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    fail 'DB_HOST must be a valid hostname or address literal without shell metacharacters.'
  fi
  if [[ ! "$DB_PORT" =~ ^[0-9]{1,5}$ ]] \
    || [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
    fail 'DB_PORT must be an integer from 1 through 65535.'
  fi
  for identifier in "$DB_NAME_DEFAULT" "$DB_USER_DEFAULT" "$DB_SCHEMA"; do
    if [ "${#identifier}" -gt 63 ] \
      || [[ ! "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      fail 'Database names, users and schemas must be safe PostgreSQL identifiers.'
    fi
  done
  case "$ROTATE_PLACEHOLDER_CREDENTIALS" in yes|no) ;; *) fail 'ROTATE_PLACEHOLDER_CREDENTIALS must be yes or no.' ;; esac
  case "$RUN_PRISMA_MIGRATE_DEPLOY" in yes|no) ;; *) fail 'RUN_PRISMA_MIGRATE_DEPLOY must be yes or no.' ;; esac
}

validate_postgres_inputs
log "Bootstrapping PostgreSQL on $INSTANCE"
REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-postgres-remote.XXXXXX)"
cleanup_remote_script() {
  case "$REMOTE_SCRIPT" in
    /tmp/r27a-gce-postgres-remote.*) rm -f -- "$REMOTE_SCRIPT" ;;
    *) fail 'Refusing to remove an unexpected temporary path.' ;;
  esac
}
trap cleanup_remote_script EXIT

cat >"$REMOTE_SCRIPT" <<'REMOTE_SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$1"
DB_HOST="$2"
DB_PORT="$3"
DB_NAME_DEFAULT="$4"
DB_USER_DEFAULT="$5"
DB_SCHEMA="$6"
ROTATE_PLACEHOLDER_CREDENTIALS="$7"
RUN_PRISMA_MIGRATE_DEPLOY="$8"
export APP_ROOT DB_HOST DB_PORT DB_NAME_DEFAULT DB_USER_DEFAULT DB_SCHEMA
export ROTATE_PLACEHOLDER_CREDENTIALS RUN_PRISMA_MIGRATE_DEPLOY
API_ENV="$APP_ROOT/apps/api/.env.production"

python3 - <<'PY'
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
import os
import secrets
import shlex
import subprocess

app_root = Path(os.environ['APP_ROOT'])
env_path = app_root / 'apps/api/.env.production'
if not env_path.exists():
    raise SystemExit('Missing ' + str(env_path))

data = {}
for line in env_path.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s:
        continue
    k, v = s.split('=', 1)
    try:
        parsed = shlex.split(v)
        data[k] = parsed[0] if parsed else ''
    except ValueError:
        data[k] = v

database_url = data.get('DATABASE_URL', '')
parsed = urlparse(database_url) if database_url else None

db_name = ((parsed.path or '/').lstrip('/') if parsed else '') or os.environ['DB_NAME_DEFAULT']
db_user = (parsed.username if parsed else '') or os.environ['DB_USER_DEFAULT']
db_password = (parsed.password if parsed else '') or ''
db_host = (parsed.hostname if parsed else '') or os.environ['DB_HOST']
db_port = str(parsed.port) if parsed and parsed.port else os.environ['DB_PORT']
query = parse_qs(parsed.query if parsed else '', keep_blank_values=True)
db_schema = (query.get('schema', [os.environ['DB_SCHEMA']])[0] or os.environ['DB_SCHEMA'])

rotate = os.environ['ROTATE_PLACEHOLDER_CREDENTIALS'] == 'yes'
if rotate and db_user == 'postgres':
    db_user = os.environ['DB_USER_DEFAULT']
if rotate and db_password in {'', 'postgres'}:
    db_password = secrets.token_urlsafe(24)

query['schema'] = [db_schema]
new_url = urlunparse((
    'postgresql',
    f'{db_user}:{db_password}@{db_host}:{db_port}',
    '/' + db_name,
    '',
    urlencode(query, doseq=True),
    '',
))
data['DATABASE_URL'] = new_url

lines = env_path.read_text().splitlines()
seen = set()
out = []
for line in lines:
    stripped = line.strip()
    if stripped and not stripped.startswith('#') and '=' in line:
        key = line.split('=', 1)[0]
        if key in data:
            out.append(f'{key}={data[key]}')
            seen.add(key)
            continue
    out.append(line)
for key, value in data.items():
    if key not in seen:
        out.append(f'{key}={value}')
env_path.write_text('\n'.join(out) + '\n')

print(f'DB_NAME={db_name}')
print(f'DB_USER={db_user}')
print(f'DB_HOST={db_host}')
print(f'DB_PORT={db_port}')
print(f'DB_SCHEMA={db_schema}')
print('DB_PASSWORD_ROTATED=' + ('yes' if db_password not in {'', 'postgres'} else 'no'))
PY

sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

cluster_version="$(pg_lsclusters --no-header | awk 'NR==1 {print $1}')"
cluster_name="$(pg_lsclusters --no-header | awk 'NR==1 {print $2}')"
[ -n "$cluster_version" ] || { echo 'No PostgreSQL cluster found.' >&2; exit 1; }
[ -n "$cluster_name" ] || { echo 'No PostgreSQL cluster name found.' >&2; exit 1; }

sudo systemctl enable postgresql
sudo systemctl restart postgresql

sudo sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = 'localhost'/" "/etc/postgresql/$cluster_version/$cluster_name/postgresql.conf"
sudo systemctl restart postgresql

DB_NAME="$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import os
import shlex
path = Path(os.environ['APP_ROOT']) / 'apps/api/.env.production'
data = {}
for line in path.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s:
        continue
    k, v = line.split('=', 1)
    try:
        parsed = shlex.split(v)
        data[k] = parsed[0] if parsed else ''
    except ValueError:
        data[k] = v
parsed = urlparse(data['DATABASE_URL'])
print((parsed.path or '/').lstrip('/'))
PY
)"

DB_USER="$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import os
import shlex
path = Path(os.environ['APP_ROOT']) / 'apps/api/.env.production'
data = {}
for line in path.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s:
        continue
    k, v = line.split('=', 1)
    try:
        parsed = shlex.split(v)
        data[k] = parsed[0] if parsed else ''
    except ValueError:
        data[k] = v
parsed = urlparse(data['DATABASE_URL'])
print(parsed.username or '')
PY
)"

DB_PASSWORD="$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import os
import shlex
path = Path(os.environ['APP_ROOT']) / 'apps/api/.env.production'
data = {}
for line in path.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s:
        continue
    k, v = line.split('=', 1)
    try:
        parsed = shlex.split(v)
        data[k] = parsed[0] if parsed else ''
    except ValueError:
        data[k] = v
parsed = urlparse(data['DATABASE_URL'])
print(parsed.password or '')
PY
)"

cd /tmp

ROLE_EXISTS="$(sudo -u postgres psql -v db_user="$DB_USER" -tA <<'SQL'
SELECT 1 FROM pg_roles WHERE rolname = :'db_user';
SQL
)"
if [ "$ROLE_EXISTS" != 1 ]; then
  sudo -u postgres createuser --login "$DB_USER"
fi
sudo -u postgres psql \
  -v ON_ERROR_STOP=1 \
  -v db_user="$DB_USER" \
  -v db_password="$DB_PASSWORD" <<'SQL'
ALTER ROLE :"db_user" WITH LOGIN PASSWORD :'db_password';
SQL

DB_EXISTS="$(sudo -u postgres psql -v db_name="$DB_NAME" -tA <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'db_name';
SQL
)"
if [ "$DB_EXISTS" != 1 ]; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

pg_isready -h localhost -p 5432

if [ "$RUN_PRISMA_MIGRATE_DEPLOY" = yes ]; then
  cd "$APP_ROOT/apps/api"
  (
    set -a
    . ./.env.production
    set +a
    pnpm exec prisma migrate deploy --schema prisma/schema.prisma
  )
fi

sudo systemctl restart feishu-timeline-api
sleep 3
systemctl is-active postgresql
systemctl is-active feishu-timeline-api

python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import os
import shlex
path = Path(os.environ['APP_ROOT']) / 'apps/api/.env.production'
data = {}
for line in path.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s:
        continue
    k, v = line.split('=', 1)
    try:
        parsed = shlex.split(v)
        data[k] = parsed[0] if parsed else ''
    except ValueError:
        data[k] = v
parsed = urlparse(data['DATABASE_URL'])
print('DATABASE_URL_host=' + (parsed.hostname or '<none>'))
print('DATABASE_URL_port=' + (str(parsed.port) if parsed.port else '<none>'))
print('DATABASE_URL_name=' + ((parsed.path or '/').lstrip('/') or '<none>'))
print('DATABASE_URL_user_present=' + ('yes' if parsed.username else 'no'))
print('DATABASE_URL_password_present=' + ('yes' if parsed.password else 'no'))
PY
REMOTE_SCRIPT_EOF

chmod 0700 "$REMOTE_SCRIPT"
gce_run_remote_script_with_args \
  "$REMOTE_SCRIPT" \
  "$APP_ROOT" \
  "$DB_HOST" \
  "$DB_PORT" \
  "$DB_NAME_DEFAULT" \
  "$DB_USER_DEFAULT" \
  "$DB_SCHEMA" \
  "$ROTATE_PLACEHOLDER_CREDENTIALS" \
  "$RUN_PRISMA_MIGRATE_DEPLOY"
