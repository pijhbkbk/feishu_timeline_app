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

log() {
  printf '[INFO] %s\n' "$*"
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

log "Bootstrapping PostgreSQL on $INSTANCE"
ssh_gce "set -euo pipefail
APP_ROOT='$APP_ROOT'
DB_HOST='$DB_HOST'
DB_PORT='$DB_PORT'
DB_NAME_DEFAULT='$DB_NAME_DEFAULT'
DB_USER_DEFAULT='$DB_USER_DEFAULT'
DB_SCHEMA='$DB_SCHEMA'
ROTATE_PLACEHOLDER_CREDENTIALS='$ROTATE_PLACEHOLDER_CREDENTIALS'
RUN_PRISMA_MIGRATE_DEPLOY='$RUN_PRISMA_MIGRATE_DEPLOY'
API_ENV=\"\$APP_ROOT/apps/api/.env.production\"

python3 - <<'PY'
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
import secrets
import shlex
import subprocess

app_root = Path('$APP_ROOT')
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

db_name = ((parsed.path or '/').lstrip('/') if parsed else '') or '$DB_NAME_DEFAULT'
db_user = (parsed.username if parsed else '') or '$DB_USER_DEFAULT'
db_password = (parsed.password if parsed else '') or ''
db_host = (parsed.hostname if parsed else '') or '$DB_HOST'
db_port = str(parsed.port) if parsed and parsed.port else '$DB_PORT'
query = parse_qs(parsed.query if parsed else '', keep_blank_values=True)
db_schema = (query.get('schema', ['$DB_SCHEMA'])[0] or '$DB_SCHEMA')

rotate = '$ROTATE_PLACEHOLDER_CREDENTIALS' == 'yes'
if rotate and db_user == 'postgres':
    db_user = '$DB_USER_DEFAULT'
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
env_path.write_text('\\n'.join(out) + '\\n')

print(f'DB_NAME={db_name}')
print(f'DB_USER={db_user}')
print(f'DB_HOST={db_host}')
print(f'DB_PORT={db_port}')
print(f'DB_SCHEMA={db_schema}')
print('DB_PASSWORD_ROTATED=' + ('yes' if db_password not in {'', 'postgres'} else 'no'))
PY

sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

cluster_version=\"\$(pg_lsclusters --no-header | awk 'NR==1 {print \$1}')\"
cluster_name=\"\$(pg_lsclusters --no-header | awk 'NR==1 {print \$2}')\"
[ -n \"\$cluster_version\" ] || { echo 'No PostgreSQL cluster found.' >&2; exit 1; }
[ -n \"\$cluster_name\" ] || { echo 'No PostgreSQL cluster name found.' >&2; exit 1; }

sudo systemctl enable postgresql
sudo systemctl restart postgresql

sudo sed -i \"s/^#\\?listen_addresses\\s*=.*/listen_addresses = 'localhost'/\" \"/etc/postgresql/\$cluster_version/\$cluster_name/postgresql.conf\"
sudo systemctl restart postgresql

DB_NAME=\"\$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import shlex
path = Path('$APP_ROOT/apps/api/.env.production')
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
)\"

DB_USER=\"\$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import shlex
path = Path('$APP_ROOT/apps/api/.env.production')
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
)\"

DB_PASSWORD=\"\$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import shlex
path = Path('$APP_ROOT/apps/api/.env.production')
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
)\"

cd /tmp

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \\$\\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\$DB_USER') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '\$DB_USER', '\$DB_PASSWORD');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', '\$DB_USER', '\$DB_PASSWORD');
  END IF;
END
\\$\\$;
SQL

if ! sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname = '\$DB_NAME'\" | grep -q 1; then
  sudo -u postgres createdb -O \"\$DB_USER\" \"\$DB_NAME\"
fi

pg_isready -h localhost -p 5432

if [ \"\$RUN_PRISMA_MIGRATE_DEPLOY\" = yes ]; then
  cd \"\$APP_ROOT/apps/api\"
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
import shlex
path = Path('$APP_ROOT/apps/api/.env.production')
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
"
