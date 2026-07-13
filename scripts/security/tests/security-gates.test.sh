#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

targets_file="$TMP_DIR/targets.txt"
"$ROOT_DIR/scripts/security/list-sast-targets.sh" >"$targets_file"

[ -s "$targets_file" ] || fail 'SAST target manifest is empty'
for expected in \
  apps/api/src/main.ts \
  apps/api/src/common/file-upload-options.ts \
  apps/web/src/app/layout.tsx \
  apps/web/src/middleware.ts \
  apps/web/next.config.ts \
  apps/web/eslint.config.mjs; do
  grep -Fx "$expected" "$targets_file" >/dev/null \
    || fail "expected SAST target is missing: $expected"
done

if grep -E '(^|/)(node_modules|\.next|dist|build|coverage|generated|__generated__|playwright-report|test-results)(/|$)|\.tsbuildinfo$|/next-env\.d\.ts$' \
  "$targets_file" >/dev/null; then
  fail 'generated or dependency path leaked into the SAST target manifest'
fi

while IFS= read -r target; do
  if ! git -C "$ROOT_DIR" ls-files --cached --others --exclude-standard -- "$target" \
    | grep -Fx "$target" >/dev/null; then
    fail "ignored or out-of-scope path leaked into the SAST target manifest: $target"
  fi
done <"$targets_file"

safe_build="$TMP_DIR/safe/.next"
mkdir -p "$safe_build/server" "$safe_build/static/chunks"
printf 'safe-build-id\n' >"$safe_build/BUILD_ID"
printf 'console.log("production bundle");\n' >"$safe_build/static/chunks/app.js"
SECURITY_REPORT_DIR="$TMP_DIR/safe-report" \
  "$ROOT_DIR/scripts/security/check-production-build-artifacts.sh" "$safe_build" >/dev/null

unsafe_build="$TMP_DIR/unsafe/.next"
mkdir -p "$unsafe_build/server" "$unsafe_build/static/chunks"
printf 'unsafe-build-id\n' >"$unsafe_build/BUILD_ID"
printf 'eval("bundle //# sourceURL=webpack-internal:///./src/app.tsx");\n' \
  >"$unsafe_build/static/chunks/app.js"
if SECURITY_REPORT_DIR="$TMP_DIR/unsafe-report" \
  "$ROOT_DIR/scripts/security/check-production-build-artifacts.sh" "$unsafe_build" \
  >/dev/null 2>&1; then
  fail 'development eval-source-map artifact was accepted'
fi

cat >"$TMP_DIR/semgrep-pass.json" <<'JSON'
{"results":[],"errors":[]}
JSON
node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-pass.json" >/dev/null

cat >"$TMP_DIR/semgrep-missing-schema.json" <<'JSON'
{}
JSON
semgrep_schema_rc=0
node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-missing-schema.json" >/dev/null 2>&1 \
  || semgrep_schema_rc=$?
[ "$semgrep_schema_rc" -eq 2 ] \
  || fail 'Semgrep report without results/errors did not fail with a tool error'

cat >"$TMP_DIR/semgrep-low.json" <<'JSON'
{"results":[{"check_id":"test.low","path":"apps/api/src/main.ts","start":{"line":1},"extra":{"severity":"INFO","metadata":{"severity":"LOW"},"message":"all scanner findings must block"}}],"errors":[]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-low.json" >/dev/null 2>&1; then
  fail 'Low/Info Semgrep finding was accepted'
fi

cat >"$TMP_DIR/semgrep-high.json" <<'JSON'
{"results":[{"check_id":"test.high","path":"apps/api/src/main.ts","start":{"line":1},"extra":{"severity":"ERROR","message":"test finding"}}],"errors":[]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-high.json" >/dev/null 2>&1; then
  fail 'blocking Semgrep finding was accepted'
fi

cat >"$TMP_DIR/semgrep-metadata-downgrade.json" <<'JSON'
{"results":[{"check_id":"test.metadata-downgrade","path":"apps/api/src/main.ts","start":{"line":1},"extra":{"severity":"ERROR","metadata":{"severity":"MEDIUM"},"message":"metadata must not downgrade scanner severity"}}],"errors":[]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-metadata-downgrade.json" >/dev/null 2>&1; then
  fail 'Semgrep metadata downgraded a blocking scanner severity'
fi

cat >"$TMP_DIR/semgrep-metadata-high.json" <<'JSON'
{"results":[{"check_id":"test.metadata-high","path":"apps/api/src/main.ts","start":{"line":1},"extra":{"severity":"WARNING","metadata":{"severity":"HIGH"},"message":"metadata high severity must block"}}],"errors":[]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-metadata-high.json" >/dev/null 2>&1; then
  fail 'blocking Semgrep metadata severity was accepted'
fi

cat >"$TMP_DIR/semgrep-error.json" <<'JSON'
{"results":[],"errors":[{"type":"ToolError","message":"scanner failed"}]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
  "$TMP_DIR/semgrep-error.json" >/dev/null 2>&1; then
  fail 'Semgrep tool error was accepted'
fi

cat >"$TMP_DIR/gitleaks-pass.json" <<'JSON'
[]
JSON
node "$ROOT_DIR/scripts/security/evaluate-gitleaks-report.mjs" \
  "$TMP_DIR/gitleaks-pass.json" >/dev/null

cat >"$TMP_DIR/gitleaks-finding.json" <<'JSON'
[{"RuleID":"test-secret","File":"apps/api/src/main.ts","StartLine":1,"Secret":"must-not-be-printed"}]
JSON
if node "$ROOT_DIR/scripts/security/evaluate-gitleaks-report.mjs" \
  "$TMP_DIR/gitleaks-finding.json" >"$TMP_DIR/gitleaks-summary.txt" 2>&1; then
  fail 'blocking Gitleaks finding was accepted'
fi
if grep -F 'must-not-be-printed' "$TMP_DIR/gitleaks-summary.txt" >/dev/null; then
  fail 'Gitleaks summary exposed a secret value'
fi

cat >"$TMP_DIR/trivy-pass.json" <<'JSON'
{"Results":[{"Target":"safe-image","Vulnerabilities":[]}]}
JSON
node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
  "$TMP_DIR/trivy-pass.json" >/dev/null

cat >"$TMP_DIR/trivy-missing-results.json" <<'JSON'
{}
JSON
trivy_schema_rc=0
node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
  "$TMP_DIR/trivy-missing-results.json" >/dev/null 2>&1 \
  || trivy_schema_rc=$?
[ "$trivy_schema_rc" -eq 2 ] \
  || fail 'Trivy report without Results did not fail with a tool error'

cat >"$TMP_DIR/trivy-invalid-results.json" <<'JSON'
{"Results":{}}
JSON
trivy_schema_rc=0
node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
  "$TMP_DIR/trivy-invalid-results.json" >/dev/null 2>&1 \
  || trivy_schema_rc=$?
[ "$trivy_schema_rc" -eq 2 ] \
  || fail 'Trivy report with invalid Results did not fail with a tool error'

cat >"$TMP_DIR/trivy-invalid-vulnerabilities.json" <<'JSON'
{"Results":[{"Target":"invalid-image","Vulnerabilities":{}}]}
JSON
trivy_schema_rc=0
node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
  "$TMP_DIR/trivy-invalid-vulnerabilities.json" >/dev/null 2>&1 \
  || trivy_schema_rc=$?
[ "$trivy_schema_rc" -eq 2 ] \
  || fail 'Trivy report with non-array Vulnerabilities did not fail with a tool error'

cat >"$TMP_DIR/trivy-high.json" <<'JSON'
{"Results":[{"Target":"unsafe-image","Vulnerabilities":[{"VulnerabilityID":"CVE-TEST","PkgName":"unsafe-package","InstalledVersion":"1.0.0","FixedVersion":"1.0.1","Severity":"HIGH"}]}]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
  "$TMP_DIR/trivy-high.json" >/dev/null 2>&1; then
  fail 'blocking Trivy finding was accepted'
fi

cat >"$TMP_DIR/trivy-medium.json" <<'JSON'
{"Results":[{"Target":"unsafe-image","Vulnerabilities":[{"VulnerabilityID":"CVE-MEDIUM","PkgName":"unsafe-package","InstalledVersion":"1.0.0","FixedVersion":"1.0.1","Severity":"MEDIUM"}]}]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
  "$TMP_DIR/trivy-medium.json" >/dev/null 2>&1; then
  fail 'Medium Trivy finding was accepted'
fi

fake_bin="$TMP_DIR/fake-bin"
mkdir -p "$fake_bin"
cat >"$fake_bin/pnpm" <<'SH'
#!/usr/bin/env bash
exit 42
SH
chmod +x "$fake_bin/pnpm"
if PATH="$fake_bin:$PATH" \
  SECURITY_REPORT_DIR="$TMP_DIR/sca-tool-error" \
  SCA_DOC_REPORT="$TMP_DIR/sca-tool-error.md" \
  bash "$ROOT_DIR/scripts/security/run-sca.sh" >/dev/null 2>&1; then
  fail 'production SCA tool failure was accepted'
fi

grep -Fx 'FAIL' "$TMP_DIR/sca-tool-error/pnpm-audit.status" >/dev/null \
  || fail 'production SCA tool failure status was not recorded'

cat >"$fake_bin/gitleaks" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "version" ]; then
  printf '8.30.1\n'
  exit 0
fi
exit 42
SH
chmod +x "$fake_bin/gitleaks"
if PATH="$fake_bin:$PATH" \
  GITLEAKS_EXECUTION_MODE=native \
  SECURITY_REPORT_DIR="$TMP_DIR/secrets-tool-error" \
  SECRETS_DOC_REPORT="$TMP_DIR/secrets-tool-error.md" \
  ROOT_GITLEAKS_REPORT="$TMP_DIR/root-gitleaks-report.json" \
  bash "$ROOT_DIR/scripts/security/run-secrets-scan.sh" >/dev/null 2>&1; then
  fail 'Gitleaks tool failure was accepted'
fi

grep -Fx 'TOOL_ERROR' "$TMP_DIR/secrets-tool-error/gitleaks-current.status" >/dev/null \
  || fail 'current-tree Gitleaks tool failure status was not recorded'
grep -Fx 'TOOL_ERROR' "$TMP_DIR/secrets-tool-error/gitleaks-history.status" >/dev/null \
  || fail 'history Gitleaks tool failure status was not recorded'

cat >"$fake_bin/gitleaks" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "version" ]; then
  printf '8.30.1\n'
  exit 0
fi
report_path=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--report-path" ]; then
    report_path="$2"
    break
  fi
  shift
done
[ -n "$report_path" ] || exit 42
printf '[]\n' >"$report_path"
exit 0
SH
chmod +x "$fake_bin/gitleaks"

shallow_repo="$TMP_DIR/shallow-repo"
mkdir -p "$shallow_repo/scripts/security"
cp "$ROOT_DIR/scripts/security/run-secrets-scan.sh" \
  "$ROOT_DIR/scripts/security/evaluate-gitleaks-report.mjs" \
  "$shallow_repo/scripts/security/"
printf 'fixture\n' >"$shallow_repo/fixture.txt"
git -C "$shallow_repo" init -q
git -C "$shallow_repo" add fixture.txt
git -C "$shallow_repo" \
  -c user.name='Security Gate Test' \
  -c user.email='security-gate@example.invalid' \
  -c commit.gpgSign=false \
  commit -qm 'test: shallow history gate'
git -C "$shallow_repo" rev-parse HEAD >"$shallow_repo/.git/shallow"

if PATH="$fake_bin:$PATH" \
  GITLEAKS_EXECUTION_MODE=native \
  SECURITY_REPORT_DIR="$TMP_DIR/secrets-shallow" \
  SECRETS_DOC_REPORT="$TMP_DIR/secrets-shallow.md" \
  ROOT_GITLEAKS_REPORT="$TMP_DIR/root-gitleaks-shallow-report.json" \
  bash "$shallow_repo/scripts/security/run-secrets-scan.sh" >/dev/null 2>&1; then
  fail 'shallow Git history was accepted as a complete secrets scan'
fi

grep -Fx 'PASS' "$TMP_DIR/secrets-shallow/gitleaks-current.status" >/dev/null \
  || fail 'current-tree Gitleaks scan did not pass in the shallow-history fixture'
grep -Fx 'TOOL_ERROR' "$TMP_DIR/secrets-shallow/gitleaks-history.status" >/dev/null \
  || fail 'shallow Git history did not produce TOOL_ERROR'
grep -F '.git/shallow' "$TMP_DIR/secrets-shallow/gitleaks-history.log" >/dev/null \
  || fail 'shallow Git history error did not explain the missing history'

cat >"$fake_bin/gitleaks" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "version" ]; then
  printf '8.30.1\n'
  exit 0
fi
report_path=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--report-path" ]; then
    report_path="$2"
    break
  fi
  shift
done
printf '[{"RuleID":"test-secret","File":"fixture.ts","StartLine":1,"Secret":"redacted-by-test"}]\n' \
  >"$report_path"
exit 1
SH
chmod +x "$fake_bin/gitleaks"
if PATH="$fake_bin:$PATH" \
  GITLEAKS_EXECUTION_MODE=native \
  SECURITY_REPORT_DIR="$TMP_DIR/secrets-finding" \
  SECRETS_DOC_REPORT="$TMP_DIR/secrets-finding.md" \
  ROOT_GITLEAKS_REPORT="$TMP_DIR/root-gitleaks-finding-report.json" \
  bash "$ROOT_DIR/scripts/security/run-secrets-scan.sh" >/dev/null 2>&1; then
  fail 'Gitleaks finding was accepted'
fi

grep -Fx 'BLOCKED' "$TMP_DIR/secrets-finding/gitleaks-current.status" >/dev/null \
  || fail 'current-tree Gitleaks finding status was not recorded'
grep -Fx 'BLOCKED' "$TMP_DIR/secrets-finding/gitleaks-history.status" >/dev/null \
  || fail 'history Gitleaks finding status was not recorded'

cat >"$TMP_DIR/zap-pass.json" <<'JSON'
{"site":[{"@name":"http://example.invalid","alerts":[]}]}
JSON
node "$ROOT_DIR/scripts/security/evaluate-zap-report.mjs" \
  "$TMP_DIR/zap-pass.json" >"$TMP_DIR/zap-pass-summary.txt"
grep -Fx 'Result: PASS' "$TMP_DIR/zap-pass-summary.txt" >/dev/null \
  || fail 'empty ZAP alert report did not produce PASS'

cat >"$TMP_DIR/zap-low-info.json" <<'JSON'
{"site":[{"@name":"http://example.invalid","alerts":[{"pluginid":"low","name":"Low fixture","riskcode":"1"},{"pluginid":"info","name":"Info fixture","riskcode":"0"}]}]}
JSON
node "$ROOT_DIR/scripts/security/evaluate-zap-report.mjs" \
  "$TMP_DIR/zap-low-info.json" >"$TMP_DIR/zap-low-info-summary.txt"
grep -Fx 'Result: PASS_WITH_TRIAGED_LOW_INFO' \
  "$TMP_DIR/zap-low-info-summary.txt" >/dev/null \
  || fail 'Low/Info-only ZAP report was not explicitly triaged'

cat >"$TMP_DIR/zap-blocking.json" <<'JSON'
{"site":[{"@name":"http://example.invalid","alerts":[{"pluginid":"medium","name":"Medium fixture","riskcode":"2"},{"pluginid":"high","name":"High fixture","riskcode":"3"},{"pluginid":"critical","name":"Critical fixture","riskcode":"4"}]}]}
JSON
if node "$ROOT_DIR/scripts/security/evaluate-zap-report.mjs" \
  "$TMP_DIR/zap-blocking.json" >/dev/null 2>&1; then
  fail 'Critical/High/Medium ZAP findings were accepted'
fi

cat >"$TMP_DIR/zap-missing-schema.json" <<'JSON'
{}
JSON
zap_schema_rc=0
node "$ROOT_DIR/scripts/security/evaluate-zap-report.mjs" \
  "$TMP_DIR/zap-missing-schema.json" >/dev/null 2>&1 \
  || zap_schema_rc=$?
[ "$zap_schema_rc" -eq 2 ] \
  || fail 'ZAP report without site data did not fail with a tool error'

http_fake_bin="$TMP_DIR/http-fake-bin"
mkdir -p "$http_fake_bin"
cat >"$http_fake_bin/curl" <<'SH'
#!/usr/bin/env bash
set -eu
header_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -D)
      header_file="$2"
      shift 2
      ;;
    -o|-w|--connect-timeout|--max-time)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "${FAKE_CURL_MODE:-pass}" = 'tool-error' ]; then
  exit 7
fi

[ -n "$header_file" ] || exit 42
{
  printf 'HTTP/1.1 200 OK\r\n'
  printf 'X-Content-Type-Options: nosniff\r\n'
  printf 'X-Frame-Options: DENY\r\n'
  printf 'Referrer-Policy: strict-origin-when-cross-origin\r\n'
  if [ "${FAKE_CURL_MODE:-pass}" != 'missing-header' ]; then
    printf 'Permissions-Policy: camera=()\r\n'
  fi
  printf 'Cache-Control: private, no-store\r\n'
  printf 'Strict-Transport-Security: max-age=31536000; includeSubDomains\r\n'
  case "${FAKE_CURL_MODE:-pass}" in
    unsafe-inline)
      printf "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; style-src-attr 'unsafe-inline'; script-src 'self' 'unsafe-inline'\r\n"
      ;;
    unsafe-eval)
      printf "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; style-src-attr 'unsafe-inline'; script-src 'self' 'unsafe-eval'\r\n"
      ;;
    *)
      printf "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; style-src-attr 'unsafe-inline'; script-src 'self' 'nonce-test' 'strict-dynamic'\r\n"
      ;;
  esac
  printf '\r\n'
} >"$header_file"
printf '200'
SH
chmod +x "$http_fake_bin/curl"

PATH="$http_fake_bin:$PATH" \
  SECURITY_REPORT_DIR="$TMP_DIR/headers-pass" \
  DOC_REPORT="$TMP_DIR/headers-pass.md" \
  SECURITY_HEADER_PATHS='/dashboard' \
  BASE_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/check-security-headers.sh" >/dev/null
grep -Fx 'PASS' "$TMP_DIR/headers-pass/security-headers.status" >/dev/null \
  || fail 'safe security headers were not accepted'

for unsafe_mode in unsafe-inline unsafe-eval; do
  if PATH="$http_fake_bin:$PATH" \
    FAKE_CURL_MODE="$unsafe_mode" \
    SECURITY_REPORT_DIR="$TMP_DIR/headers-$unsafe_mode" \
    DOC_REPORT="$TMP_DIR/headers-$unsafe_mode.md" \
    SECURITY_HEADER_PATHS='/dashboard' \
    BASE_URL='http://localhost:3000' \
    bash "$ROOT_DIR/scripts/security/check-security-headers.sh" >/dev/null 2>&1; then
    fail "CSP script-src $unsafe_mode was accepted"
  fi
  grep -Fx 'FAIL' "$TMP_DIR/headers-$unsafe_mode/security-headers.status" >/dev/null \
    || fail "CSP script-src $unsafe_mode failure status was not recorded"
done

if PATH="$http_fake_bin:$PATH" \
  FAKE_CURL_MODE='missing-header' \
  SECURITY_REPORT_DIR="$TMP_DIR/headers-missing" \
  DOC_REPORT="$TMP_DIR/headers-missing.md" \
  SECURITY_HEADER_PATHS='/dashboard' \
  BASE_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/check-security-headers.sh" >/dev/null 2>&1; then
  fail 'missing required security header was accepted'
fi
grep -Fx 'FAIL' "$TMP_DIR/headers-missing/security-headers.status" >/dev/null \
  || fail 'missing security header failure status was not recorded'

if PATH="$http_fake_bin:$PATH" \
  FAKE_CURL_MODE='tool-error' \
  SECURITY_REPORT_DIR="$TMP_DIR/headers-tool-error" \
  DOC_REPORT="$TMP_DIR/headers-tool-error.md" \
  SECURITY_HEADER_PATHS='/dashboard' \
  BASE_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/check-security-headers.sh" >/dev/null 2>&1; then
  fail 'security header curl failure was accepted'
fi
grep -Fx 'TOOL_ERROR' "$TMP_DIR/headers-tool-error/security-headers.status" >/dev/null \
  || fail 'security header curl failure status was not recorded'

zap_fake_bin="$TMP_DIR/zap-fake-bin"
mkdir -p "$zap_fake_bin"
cat >"$zap_fake_bin/docker" <<'SH'
#!/usr/bin/env bash
set -eu
mount=""
previous=""
for argument in "$@"; do
  if [ "$previous" = '-v' ]; then
    mount="$argument"
    break
  fi
  previous="$argument"
done

[ -n "$mount" ] || exit 42
report_dir="${mount%%:/zap/wrk/:rw}"
if [ -n "${FAKE_DOCKER_ARGS_FILE:-}" ]; then
  printf '%s\n' "$*" >"$FAKE_DOCKER_ARGS_FILE"
fi

case "${FAKE_DOCKER_MODE:-low-info}" in
  tool-error)
    exit 125
    ;;
  missing-artifact)
    exit 0
    ;;
  invalid-schema)
    printf '{}\n' >"$report_dir/zap-baseline.json"
    printf '<html>fixture</html>\n' >"$report_dir/zap-baseline.html"
    exit 0
    ;;
  medium)
    printf '%s\n' '{"site":[{"@name":"http://example.invalid","alerts":[{"pluginid":"medium","name":"Medium fixture","riskcode":"2"}]}]}' >"$report_dir/zap-baseline.json"
    printf '<html>fixture</html>\n' >"$report_dir/zap-baseline.html"
    exit 1
    ;;
  low-info)
    printf '%s\n' '{"site":[{"@name":"http://example.invalid","alerts":[{"pluginid":"low","name":"Low fixture","riskcode":"1"},{"pluginid":"info","name":"Info fixture","riskcode":"0"}]}]}' >"$report_dir/zap-baseline.json"
    printf '<html>fixture</html>\n' >"$report_dir/zap-baseline.html"
    exit 2
    ;;
  *)
    exit 42
    ;;
esac
SH
chmod +x "$zap_fake_bin/docker"

PATH="$zap_fake_bin:$PATH" \
  FAKE_DOCKER_MODE='low-info' \
  FAKE_DOCKER_ARGS_FILE="$TMP_DIR/zap-docker-args.txt" \
  SECURITY_REPORT_DIR="$TMP_DIR/zap-low-info-run" \
  DOC_REPORT="$TMP_DIR/zap-low-info-run.md" \
  TARGET_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/run-zap-baseline.sh" >/dev/null
grep -Fx 'PASS_WITH_TRIAGED_LOW_INFO' \
  "$TMP_DIR/zap-low-info-run/zap-baseline.status" >/dev/null \
  || fail 'Low/Info-only ZAP baseline did not pass with explicit triage'
grep -F 'ghcr.io/zaproxy/zaproxy:stable@sha256:8d387b1a63e3425beef4846e39719f5af2a787753af2d8b6558c6257d7a577a2' \
  "$TMP_DIR/zap-docker-args.txt" >/dev/null \
  || fail 'ZAP baseline did not use the pinned image digest'

if PATH="$zap_fake_bin:$PATH" \
  FAKE_DOCKER_MODE='medium' \
  SECURITY_REPORT_DIR="$TMP_DIR/zap-medium-run" \
  DOC_REPORT="$TMP_DIR/zap-medium-run.md" \
  TARGET_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/run-zap-baseline.sh" >/dev/null 2>&1; then
  fail 'Medium ZAP baseline finding was accepted'
fi
grep -Fx 'FAIL' "$TMP_DIR/zap-medium-run/zap-baseline.status" >/dev/null \
  || fail 'Medium ZAP finding failure status was not recorded'

if PATH="$zap_fake_bin:$PATH" \
  FAKE_DOCKER_MODE='invalid-schema' \
  SECURITY_REPORT_DIR="$TMP_DIR/zap-invalid-run" \
  DOC_REPORT="$TMP_DIR/zap-invalid-run.md" \
  TARGET_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/run-zap-baseline.sh" >/dev/null 2>&1; then
  fail 'invalid ZAP JSON schema was accepted'
fi
grep -Fx 'TOOL_ERROR' "$TMP_DIR/zap-invalid-run/zap-baseline.status" >/dev/null \
  || fail 'invalid ZAP JSON schema status was not recorded'

mkdir -p "$TMP_DIR/zap-tool-error-run"
printf '%s\n' '{"site":[{"@name":"stale","alerts":[]}]}' \
  >"$TMP_DIR/zap-tool-error-run/zap-baseline.json"
printf '<html>stale</html>\n' >"$TMP_DIR/zap-tool-error-run/zap-baseline.html"
if PATH="$zap_fake_bin:$PATH" \
  FAKE_DOCKER_MODE='tool-error' \
  SECURITY_REPORT_DIR="$TMP_DIR/zap-tool-error-run" \
  DOC_REPORT="$TMP_DIR/zap-tool-error-run.md" \
  TARGET_URL='http://localhost:3000' \
  bash "$ROOT_DIR/scripts/security/run-zap-baseline.sh" >/dev/null 2>&1; then
  fail 'ZAP/Docker execution failure was accepted'
fi
grep -Fx 'TOOL_ERROR' "$TMP_DIR/zap-tool-error-run/zap-baseline.status" >/dev/null \
  || fail 'ZAP/Docker execution failure status was not recorded'
[ ! -e "$TMP_DIR/zap-tool-error-run/zap-baseline.json" ] \
  || fail 'stale ZAP JSON report survived a failed scan'

printf 'PASS: security gate regression tests\n'
