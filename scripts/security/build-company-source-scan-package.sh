#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
OUTPUT_DIR="${1:-$ROOT_DIR/reports/security/r27/company-source-package}"
REQUESTED_SOURCE_COMMIT="${SOURCE_COMMIT:-HEAD}"
ARCHIVE_ROOT="feishu-timeline-r27-company-source"
PROHIBITED_TRACKED_PATTERN='(^|/)(node_modules|\.next|dist|coverage|test-results|var/backups)(/|$)'

fail() {
  printf '[FAIL] %s\n' "$*" >&2
  exit 1
}

sha256_file() {
  local file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
    return
  fi

  fail 'Neither sha256sum nor shasum is available.'
}

is_excluded_path() {
  local path="$1"
  local lower_path
  lower_path="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"

  if [[ "$path" =~ (^|/)(node_modules|\.next|dist|build|coverage|test-results|playwright-report|reports|backups|var/backups|__pycache__|\.pytest_cache)(/|$) ]]; then
    return 0
  fi

  case "$lower_path" in
    *.env|*.env.*|*/.env|*/.env.*)
      return 0
      ;;
    *.log|*.out|*.err|*.har|*.trace|*.trace.zip|*.sarif|*.dump|*.bak|*.backup|*.sqlite|*.sqlite3|*.db|*.pyc|*.pyo)
      return 0
      ;;
    */.auth/*|*/playwright/.auth/*)
      return 0
      ;;
    */auth-state.json|*/auth-state.yaml|*/auth-state.yml|*/auth-state.txt|*/storage-state.json|*/storage-state.yaml|*/storage-state.yml|*/storage-state.txt)
      return 0
      ;;
    */session-state.json|*/session-state.yaml|*/session-state.yml|*/session-state.txt|*/session-data.json|*/session-data.yaml|*/session-data.yml|*/session-data.txt)
      return 0
      ;;
    */cookies.json|*/cookies.yaml|*/cookies.yml|*/cookies.txt|*/cookie-jar.json|*/cookie-jar.yaml|*/cookie-jar.yml|*/cookie-jar.txt)
      return 0
      ;;
    */dumps/*|*/database-dumps/*|*/database-backups/*|var/log/*|*/var/log/*|*/runtime-logs/*|*/artifacts/logs/*)
      return 0
      ;;
    *.pem|*.key|*/id_rsa|*/id_ed25519|*/credentials.json|*/service-account.json)
      return 0
      ;;
    *.sql)
      case "$path" in
        apps/api/prisma/migrations/*/migration.sql)
          return 1
          ;;
        *)
          return 0
          ;;
      esac
      ;;
  esac

  return 1
}

require_manifest_match() {
  local description="$1"
  local pattern="$2"
  local manifest="$3"

  if ! grep -Eq "$pattern" "$manifest"; then
    fail "Required source category is empty: $description"
  fi
}

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "REPO_ROOT is not a Git worktree: $ROOT_DIR"
fi

ROOT_DIR="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse --verify "${REQUESTED_SOURCE_COMMIT}^{commit}")" \
  || fail "SOURCE_COMMIT does not resolve to a commit: $REQUESTED_SOURCE_COMMIT"

if [ "${#SOURCE_COMMIT}" -ne 40 ]; then
  fail "Resolved source commit is not a full 40-character object id: $SOURCE_COMMIT"
fi

cd "$ROOT_DIR"

PACKAGER_REPO_PATH='scripts/security/build-company-source-scan-package.sh'
if ! git cat-file -e "$SOURCE_COMMIT:$PACKAGER_REPO_PATH" 2>/dev/null; then
  fail "Source commit $SOURCE_COMMIT does not contain the company source packager. Commit it before packaging."
fi
running_packager_blob="$(git hash-object "$SCRIPT_DIR/$(basename "$0")")"
source_packager_blob="$(git rev-parse "$SOURCE_COMMIT:$PACKAGER_REPO_PATH")"
if [ "$running_packager_blob" != "$source_packager_blob" ]; then
  fail 'The executing packager differs from the version in SOURCE_COMMIT; run the committed version from a clean worktree.'
fi

# R27's mandatory tracked-file precheck. A match is a packaging blocker, not an
# item that may be silently removed from the company package.
precheck_status=0
if tracked_prohibited="$(git ls-files | grep -E "$PROHIBITED_TRACKED_PATTERN")"; then
  printf '%s\n' "$tracked_prohibited" >&2
  fail 'The Git index contains a prohibited generated/output path.'
else
  precheck_status=$?
fi
if [ "$precheck_status" -ne 1 ]; then
  fail "Tracked-file precheck did not complete successfully (grep exit $precheck_status)."
fi

target_precheck_status=0
if target_prohibited="$(git ls-tree -r --name-only "$SOURCE_COMMIT" | grep -E "$PROHIBITED_TRACKED_PATTERN")"; then
  printf '%s\n' "$target_prohibited" >&2
  fail "Source commit $SOURCE_COMMIT contains a prohibited generated/output path."
else
  target_precheck_status=$?
fi
if [ "$target_precheck_status" -ne 1 ]; then
  fail "Source-commit precheck did not complete successfully (grep exit $target_precheck_status)."
fi

# This is an allowlist, intentionally not a repository-wide archive. It covers
# application/shared sources, schema/migrations, build manifests/configuration,
# container/reverse-proxy/service definitions, operational scripts and CI.
ALLOWLIST_PATHS=(
  apps/web
  apps/api
  packages/shared
  deploy
  scripts
  .github/workflows
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.mjs
  docker-compose.yml
  .dockerignore
)

# Never package a commit while the same source scope has uncommitted or
# nonignored untracked inputs in the worktree. The caller must first create an
# immutable candidate commit and pass its id through SOURCE_COMMIT.
if ! git diff --quiet -- "${ALLOWLIST_PATHS[@]}"; then
  git diff --name-only -- "${ALLOWLIST_PATHS[@]}" >&2
  fail 'Allowlisted source has unstaged changes; create an immutable source commit first.'
fi
if ! git diff --cached --quiet -- "${ALLOWLIST_PATHS[@]}"; then
  git diff --cached --name-only -- "${ALLOWLIST_PATHS[@]}" >&2
  fail 'Allowlisted source has staged changes; create an immutable source commit first.'
fi

untracked_status=0
if untracked_source="$(git ls-files --others --exclude-standard -- "${ALLOWLIST_PATHS[@]}")"; then
  untracked_status=0
else
  untracked_status=$?
fi
if [ "$untracked_status" -ne 0 ]; then
  fail "Untracked-source discovery failed (git exit $untracked_status)."
fi
if [ -n "$untracked_source" ]; then
  printf '%s\n' "$untracked_source" >&2
  fail 'Allowlisted source has nonignored untracked files; create an immutable source commit first.'
fi

WORK_DIR="$(mktemp -d /tmp/r27-company-source-package.XXXXXX)"
cleanup() {
  case "$WORK_DIR" in
    /tmp/r27-company-source-package.*)
      find "$WORK_DIR" -mindepth 1 -depth -delete
      rmdir "$WORK_DIR"
      ;;
    *)
      printf '[WARN] Refusing to remove unexpected temporary path: %s\n' "$WORK_DIR" >&2
      ;;
  esac
}
trap cleanup EXIT

CANDIDATE_MANIFEST="$WORK_DIR/candidates.txt"
SELECTED_MANIFEST="$WORK_DIR/selected.txt"
EXCLUDED_MANIFEST="$WORK_DIR/excluded.txt"
ARCHIVE_LIST="$WORK_DIR/archive-list.txt"
STAGE_DIR="$WORK_DIR/stage"
STAGE_ROOT="$STAGE_DIR/$ARCHIVE_ROOT"

: >"$CANDIDATE_MANIFEST"
: >"$SELECTED_MANIFEST"
: >"$EXCLUDED_MANIFEST"
: >"$ARCHIVE_LIST"
mkdir -p "$STAGE_ROOT"

while IFS= read -r -d '' path; do
  case "$path" in
    *$'\n'*)
      fail "A source path contains a newline and cannot be represented safely: $path"
      ;;
  esac

  printf '%s\n' "$path" >>"$CANDIDATE_MANIFEST"
  if is_excluded_path "$path"; then
    printf '%s\n' "$path" >>"$EXCLUDED_MANIFEST"
    continue
  fi
  printf '%s\n' "$path" >>"$SELECTED_MANIFEST"
done < <(git ls-tree -r -z --name-only "$SOURCE_COMMIT" -- "${ALLOWLIST_PATHS[@]}")

if [ ! -s "$SELECTED_MANIFEST" ]; then
  fail "The allowlist selected no files from source commit $SOURCE_COMMIT."
fi

require_manifest_match 'Web first-party source' '^apps/web/src/' "$SELECTED_MANIFEST"
require_manifest_match 'API first-party source' '^apps/api/src/' "$SELECTED_MANIFEST"
require_manifest_match 'shared first-party source' '^packages/shared/src/' "$SELECTED_MANIFEST"
require_manifest_match 'project activity-log route source' '^apps/web/src/app/projects/\[projectId\]/logs/page\.tsx$' "$SELECTED_MANIFEST"
require_manifest_match 'authentication service source' '^apps/api/src/modules/auth/auth\.service\.ts$' "$SELECTED_MANIFEST"
require_manifest_match 'session store source' '^apps/api/src/modules/auth/session-store\.service\.ts$' "$SELECTED_MANIFEST"
require_manifest_match 'session/cookie guard source' '^apps/api/src/modules/auth/session-auth\.guard\.ts$' "$SELECTED_MANIFEST"
require_manifest_match 'Feishu CN OAuth provider source' '^apps/api/src/common/feishu-oauth-provider\.ts$' "$SELECTED_MANIFEST"
require_manifest_match 'Web authentication/session source' '^apps/web/src/components/auth-provider\.tsx$' "$SELECTED_MANIFEST"
require_manifest_match 'Prisma schema' '^apps/api/prisma/schema\.prisma$' "$SELECTED_MANIFEST"
require_manifest_match 'Prisma migrations' '^apps/api/prisma/migrations/[^/]+/migration\.sql$' "$SELECTED_MANIFEST"
require_manifest_match 'root package manifest' '^package\.json$' "$SELECTED_MANIFEST"
require_manifest_match 'pnpm lockfile' '^pnpm-lock\.yaml$' "$SELECTED_MANIFEST"
require_manifest_match 'TypeScript configuration' '(^|/)tsconfig[^/]*\.json$' "$SELECTED_MANIFEST"
require_manifest_match 'API Dockerfile' '^apps/api/Dockerfile$' "$SELECTED_MANIFEST"
require_manifest_match 'Web Dockerfile' '^apps/web/Dockerfile$' "$SELECTED_MANIFEST"
require_manifest_match 'Nginx configuration' '^deploy/nginx/' "$SELECTED_MANIFEST"
require_manifest_match 'systemd configuration' '^deploy/systemd/' "$SELECTED_MANIFEST"
require_manifest_match 'deployment scripts' '^scripts/deploy/' "$SELECTED_MANIFEST"
require_manifest_match 'CI configuration' '^\.github/workflows/' "$SELECTED_MANIFEST"
require_manifest_match 'company source packaging script' '^scripts/security/build-company-source-scan-package\.sh$' "$SELECTED_MANIFEST"

unsupported_modes="$(
  git ls-tree -r "$SOURCE_COMMIT" -- "${ALLOWLIST_PATHS[@]}" \
    | awk '$1 != "100644" && $1 != "100755" { print }'
)"
if [ -n "$unsupported_modes" ]; then
  printf '%s\n' "$unsupported_modes" >&2
  fail 'Allowlisted source contains a symlink, submodule or unsupported Git file mode.'
fi

# Extract one immutable Git archive into the temporary staging area. Only the
# selected manifest is later fed to the final tar command, so excluded tracked
# candidates can never enter the company package.
git archive \
  --format=tar \
  --prefix="$ARCHIVE_ROOT/" \
  "$SOURCE_COMMIT" \
  -- "${ALLOWLIST_PATHS[@]}" \
  | tar -xf - -C "$STAGE_DIR"

while IFS= read -r path; do
  [ -n "$path" ] || continue
  destination="$STAGE_ROOT/$path"
  if [ ! -f "$destination" ] || [ -L "$destination" ]; then
    fail "Selected Git blob was not extracted as a regular file: $path"
  fi
  if [ -x "$destination" ]; then
    chmod 0755 "$destination"
  else
    chmod 0644 "$destination"
  fi
  touch -t 200001010000 "$destination"
  printf '%s/%s\n' "$ARCHIVE_ROOT" "$path" >>"$ARCHIVE_LIST"
done <"$SELECTED_MANIFEST"

mkdir -p "$OUTPUT_DIR"
SHORT_COMMIT="${SOURCE_COMMIT:0:12}"
PACKAGE_BASENAME="company-source-scan-${SHORT_COMMIT}"
ARCHIVE_PATH="$OUTPUT_DIR/${PACKAGE_BASENAME}.tar.gz"
CONTENTS_PATH="$OUTPUT_DIR/${PACKAGE_BASENAME}.contents.txt"
EXCLUDED_PATH="$OUTPUT_DIR/${PACKAGE_BASENAME}.excluded.txt"
FILES_SHA_PATH="$OUTPUT_DIR/${PACKAGE_BASENAME}.files.sha256"
ARCHIVE_SHA_PATH="$OUTPUT_DIR/${PACKAGE_BASENAME}.tar.gz.sha256"
METADATA_PATH="$OUTPUT_DIR/${PACKAGE_BASENAME}.metadata.txt"
TEMP_ARCHIVE="$WORK_DIR/${PACKAGE_BASENAME}.tar.gz"
TEMP_CONTENTS="$WORK_DIR/${PACKAGE_BASENAME}.contents.txt"
TEMP_EXCLUDED="$WORK_DIR/${PACKAGE_BASENAME}.excluded.txt"
TEMP_FILES_SHA="$WORK_DIR/${PACKAGE_BASENAME}.files.sha256"
TEMP_ARCHIVE_SHA="$WORK_DIR/${PACKAGE_BASENAME}.tar.gz.sha256"
TEMP_METADATA="$WORK_DIR/${PACKAGE_BASENAME}.metadata.txt"

cp "$ARCHIVE_LIST" "$TEMP_CONTENTS"
cp "$EXCLUDED_MANIFEST" "$TEMP_EXCLUDED"
HASH_INPUTS=()
while IFS= read -r path; do
  [ -n "$path" ] && HASH_INPUTS+=("$STAGE_DIR/$path")
done <"$ARCHIVE_LIST"

RAW_HASHES="$WORK_DIR/raw-files.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${HASH_INPUTS[@]}" >"$RAW_HASHES"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${HASH_INPUTS[@]}" >"$RAW_HASHES"
else
  fail 'Neither sha256sum nor shasum is available.'
fi

exec 3<"$ARCHIVE_LIST"
while IFS= read -r hash_line; do
  if ! IFS= read -r path <&3; then
    fail 'Per-file hash output contains more records than the archive manifest.'
  fi
  digest="${hash_line%% *}"
  printf '%s  %s\n' "$digest" "$path" >>"$TEMP_FILES_SHA"
done <"$RAW_HASHES"
if IFS= read -r extra_path <&3; then
  fail "Per-file hash output is incomplete; first missing path: $extra_path"
fi
exec 3<&-

# Files are supplied in Git tree order. Their bytes, mode, owner/group, mtime,
# tar format and gzip header are normalized, so identical source trees produce
# byte-identical archives on supported bsdtar/GNU tar implementations.
COPYFILE_DISABLE=1 tar \
  --format ustar \
  --uid 0 \
  --gid 0 \
  --uname root \
  --gname root \
  -cf - \
  -C "$STAGE_DIR" \
  -T "$ARCHIVE_LIST" \
  | gzip -n -9 >"$TEMP_ARCHIVE"

archive_digest="$(sha256_file "$TEMP_ARCHIVE")"
file_count="$(wc -l <"$SELECTED_MANIFEST" | tr -d '[:space:]')"
excluded_count="$(wc -l <"$EXCLUDED_MANIFEST" | tr -d '[:space:]')"
printf '%s  %s\n' "$archive_digest" "$(basename "$ARCHIVE_PATH")" >"$TEMP_ARCHIVE_SHA"
cat >"$TEMP_METADATA" <<EOF
formatVersion=1
sourceCommit=$SOURCE_COMMIT
archiveRoot=$ARCHIVE_ROOT
fileCount=$file_count
excludedCandidateCount=$excluded_count
archiveSha256=$archive_digest
EOF

mv -f "$TEMP_ARCHIVE" "$ARCHIVE_PATH"
mv -f "$TEMP_CONTENTS" "$CONTENTS_PATH"
mv -f "$TEMP_EXCLUDED" "$EXCLUDED_PATH"
mv -f "$TEMP_FILES_SHA" "$FILES_SHA_PATH"
mv -f "$TEMP_ARCHIVE_SHA" "$ARCHIVE_SHA_PATH"
mv -f "$TEMP_METADATA" "$METADATA_PATH"

printf '[PASS] R27 company source package built from immutable commit %s\n' "$SOURCE_COMMIT"
printf '[PASS] Included files: %s; excluded allowlist candidates: %s\n' "$file_count" "$excluded_count"
printf '[PASS] Archive: %s\n' "$ARCHIVE_PATH"
printf '[PASS] Archive SHA-256: %s\n' "$archive_digest"
printf '[PASS] Contents: %s\n' "$CONTENTS_PATH"
printf '[PASS] Excluded candidates: %s\n' "$EXCLUDED_PATH"
printf '[PASS] Per-file SHA-256: %s\n' "$FILES_SHA_PATH"
printf '[PASS] Metadata: %s\n' "$METADATA_PATH"
