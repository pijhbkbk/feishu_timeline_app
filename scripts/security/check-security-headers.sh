#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/headers}"
DOC_REPORT="${DOC_REPORT:-$ROOT_DIR/docs/security/SECURITY_HEADERS_R19.md}"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

BASE_URL="${BASE_URL:-http://localhost:3000}"
CONFIRM_AUTHORIZED_TARGET="${CONFIRM_AUTHORIZED_TARGET:-no}"
CURL_BIN="${CURL_BIN:-curl}"
DEFAULT_PATHS=$'/\n/guide\n/dashboard\n/projects\n/projects/timeline\n/materials\n/monthly-reviews\n/analytics\n/login/callback'
SECURITY_HEADER_PATHS="${SECURITY_HEADER_PATHS:-$DEFAULT_PATHS}"

case "$BASE_URL" in
  http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*|http://host.docker.internal:*)
    ;;
  *)
    if [ "$CONFIRM_AUTHORIZED_TARGET" != "yes" ]; then
      printf '[ERROR] Remote header target requires CONFIRM_AUTHORIZED_TARGET=yes: %s\n' "$BASE_URL" >&2
      exit 2
    fi
    ;;
esac

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
raw="$REPORT_DIR/security-headers.raw.txt"
results="$REPORT_DIR/security-headers.results.tsv"
status_file="$REPORT_DIR/security-headers.status"
: >"$raw"
: >"$results"

cleanup_response_files() {
  rm -f "$REPORT_DIR"/response-*.headers "$REPORT_DIR"/response-*.cookies
}
trap cleanup_response_files EXIT

header_value() {
  local file="$1"
  local wanted="$2"

  awk -v wanted="$(printf '%s' "$wanted" | tr '[:upper:]' '[:lower:]')" '
    {
      name = $0
      sub(/:.*/, "", name)
      if (tolower(name) == wanted) {
        value = substr($0, index($0, ":") + 1)
        sub(/^[[:space:]]+/, "", value)
        sub(/[[:space:]\r]+$/, "", value)
        print value
      }
    }
  ' "$file" | tail -n 1
}

header_values() {
  local file="$1"
  local wanted="$2"

  awk -v wanted="$(printf '%s' "$wanted" | tr '[:upper:]' '[:lower:]')" '
    {
      name = $0
      sub(/:.*/, "", name)
      if (tolower(name) == wanted) {
        value = substr($0, index($0, ":") + 1)
        sub(/^[[:space:]]+/, "", value)
        sub(/[[:space:]\r]+$/, "", value)
        print value
      }
    }
  ' "$file"
}

print_redacted_headers() {
  local file="$1"

  awk '
    {
      name = $0
      sub(/:.*/, "", name)
      if (tolower(name) == "set-cookie") {
        print "Set-Cookie: [REDACTED]"
      } else {
        print
      }
    }
  ' "$file"
}

csp_directive() {
  local csp="$1"
  local wanted="$2"

  printf '%s\n' "$csp" | tr ';' '\n' | awk -v wanted="$wanted" '
    {
      sub(/^[[:space:]]+/, "", $0)
      if (tolower($1) == wanted) {
        $1 = ""
        sub(/^[[:space:]]+/, "", $0)
        print
        exit
      }
    }
  '
}

append_issue() {
  local issue="$1"
  if [ -z "$issues" ]; then
    issues="$issue"
  else
    issues="$issues; $issue"
  fi
}

is_sensitive_path() {
  case "$1" in
    /dashboard|/projects|/projects/*|/materials|/monthly-reviews|/analytics|/login/callback)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

tool_errors=0
policy_failures=0
checked=0

while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    /*) ;;
    *)
      printf '[ERROR] Security header path must start with /: %s\n' "$path" >&2
      tool_errors=$((tool_errors + 1))
      continue
      ;;
  esac

  checked=$((checked + 1))
  url="${BASE_URL%/}$path"
  response_headers="$REPORT_DIR/response-$checked.headers"
  issues=""
  curl_rc=0
  http_status=""
  curl_options=(-sS)
  if [ "${HEADER_INSECURE_TLS:-no}" = 'yes' ]; then
    curl_options=(-k "${curl_options[@]}")
  fi

  http_status="$("$CURL_BIN" "${curl_options[@]}" \
    --connect-timeout "${HEADER_CONNECT_TIMEOUT_SECONDS:-10}" \
    --max-time "${HEADER_MAX_TIME_SECONDS:-30}" \
    -D "$response_headers" \
    -o /dev/null \
    -w '%{http_code}' \
    "$url")" || curl_rc=$?

  {
    printf '\n===== %s =====\n' "$url"
    printf 'curl_exit=%s http_status=%s\n' "$curl_rc" "${http_status:-unknown}"
    if [ -f "$response_headers" ]; then
      print_redacted_headers "$response_headers" | sed -n '1,240p'
    fi
  } >>"$raw"

  if [ "$curl_rc" -ne 0 ]; then
    append_issue "curl failed with exit $curl_rc"
    tool_errors=$((tool_errors + 1))
    printf '%s\tTOOL_ERROR\t%s\t%s\n' "$url" "${http_status:-unknown}" "$issues" >>"$results"
    continue
  fi

  if ! printf '%s' "$http_status" | grep -Eq '^[0-9]{3}$'; then
    append_issue "curl returned an invalid HTTP status"
    tool_errors=$((tool_errors + 1))
    printf '%s\tTOOL_ERROR\t%s\t%s\n' "$url" "${http_status:-unknown}" "$issues" >>"$results"
    continue
  fi

  if [ ! -s "$response_headers" ]; then
    append_issue 'curl produced no response headers'
    tool_errors=$((tool_errors + 1))
    printf '%s\tTOOL_ERROR\t%s\t%s\n' "$url" "$http_status" "$issues" >>"$results"
    continue
  fi

  if [ "$http_status" -lt 200 ] || [ "$http_status" -ge 400 ]; then
    append_issue "unexpected HTTP status $http_status"
  fi

  content_type_options="$(header_value "$response_headers" 'X-Content-Type-Options')"
  [ "$(printf '%s' "$content_type_options" | tr '[:upper:]' '[:lower:]')" = 'nosniff' ] \
    || append_issue 'X-Content-Type-Options must be nosniff'

  csp="$(header_value "$response_headers" 'Content-Security-Policy')"
  if [ -z "$csp" ]; then
    append_issue 'Content-Security-Policy is missing'
  else
    script_sources="$(csp_directive "$csp" 'script-src')"
    if [ -z "$script_sources" ]; then
      append_issue 'CSP script-src directive is missing'
    elif printf '%s\n' "$script_sources" \
      | grep -Eiq "(^|[[:space:]])'unsafe-(inline|eval)'([[:space:]]|$)"; then
      append_issue "CSP script-src permits unsafe-inline or unsafe-eval"
    fi
  fi

  x_frame_options="$(header_value "$response_headers" 'X-Frame-Options')"
  frame_ancestors="$(csp_directive "$csp" 'frame-ancestors')"
  if ! printf '%s\n' "$x_frame_options" | grep -Eiq '^(DENY|SAMEORIGIN)$' \
    && [ -z "$frame_ancestors" ]; then
    append_issue 'X-Frame-Options or CSP frame-ancestors is required'
  fi

  referrer_policy="$(header_value "$response_headers" 'Referrer-Policy')"
  if [ -z "$referrer_policy" ] \
    || printf '%s\n' "$referrer_policy" | grep -Eiq '(^|,)[[:space:]]*unsafe-url([[:space:]]*,|$)'; then
    append_issue 'Referrer-Policy is missing or unsafe'
  fi

  permissions_policy="$(header_value "$response_headers" 'Permissions-Policy')"
  [ -n "$permissions_policy" ] || append_issue 'Permissions-Policy is missing'

  cache_control="$(header_value "$response_headers" 'Cache-Control')"
  if is_sensitive_path "$path"; then
    if [ -z "$cache_control" ] \
      || ! printf '%s\n' "$cache_control" | grep -Eiq '(^|,)[[:space:]]*(no-store|private)([=[:space:]]|,|$)'; then
      append_issue 'sensitive response must use Cache-Control no-store or private'
    fi
    if printf '%s\n' "$cache_control" | grep -Eiq '(^|,)[[:space:]]*public([=[:space:]]|,|$)'; then
      append_issue 'sensitive response must not be publicly cacheable'
    fi
  fi

  hsts="$(header_value "$response_headers" 'Strict-Transport-Security')"
  case "$BASE_URL" in
    https://*)
      if [ -z "$hsts" ] || ! printf '%s\n' "$hsts" | grep -Eiq '(^|;)[[:space:]]*max-age=[1-9][0-9]*([[:space:]]*;|$)'; then
        append_issue 'HTTPS response requires Strict-Transport-Security with a positive max-age'
      fi
      ;;
  esac

  set_cookie_file="$REPORT_DIR/response-$checked.cookies"
  header_values "$response_headers" 'Set-Cookie' >"$set_cookie_file"
  while IFS= read -r cookie; do
    [ -n "$cookie" ] || continue
    printf '%s\n' "$cookie" | grep -Eiq '(^|;)[[:space:]]*HttpOnly([[:space:]]*;|$)' \
      || append_issue 'Set-Cookie is missing HttpOnly'
    printf '%s\n' "$cookie" | grep -Eiq '(^|;)[[:space:]]*SameSite=(Strict|Lax|None)([[:space:]]*;|$)' \
      || append_issue 'Set-Cookie is missing a valid SameSite attribute'
    if printf '%s\n' "$cookie" | grep -Eiq '(^|;)[[:space:]]*SameSite=None([[:space:]]*;|$)' \
      && ! printf '%s\n' "$cookie" | grep -Eiq '(^|;)[[:space:]]*Secure([[:space:]]*;|$)'; then
      append_issue 'SameSite=None cookie is missing Secure'
    fi
    case "$BASE_URL" in
      https://*)
        printf '%s\n' "$cookie" | grep -Eiq '(^|;)[[:space:]]*Secure([[:space:]]*;|$)' \
          || append_issue 'HTTPS Set-Cookie is missing Secure'
        ;;
    esac
  done <"$set_cookie_file"

  if [ -n "$issues" ]; then
    policy_failures=$((policy_failures + 1))
    printf '%s\tFAIL\t%s\t%s\n' "$url" "$http_status" "$issues" >>"$results"
  else
    printf '%s\tPASS\t%s\t-\n' "$url" "$http_status" >>"$results"
  fi
done <<<"$SECURITY_HEADER_PATHS"

if [ "$checked" -eq 0 ]; then
  tool_errors=$((tool_errors + 1))
fi

if [ "$tool_errors" -gt 0 ]; then
  overall_status="TOOL_ERROR"
  exit_code=2
elif [ "$policy_failures" -gt 0 ]; then
  overall_status="FAIL"
  exit_code=1
else
  overall_status="PASS"
  exit_code=0
fi

printf '%s\n' "$overall_status" >"$status_file"

{
  printf '# Security Headers R19B\n\n'
  printf 'Generated: %s\n' "$timestamp"
  printf 'Commit: %s\n' "$commit"
  printf 'Base URL: %s\n' "$BASE_URL"
  printf 'Result: **%s**\n\n' "$overall_status"
  printf '## Machine-checked responses\n\n'
  printf '| URL | Result | HTTP | Detail |\n'
  printf '|---|---|---:|---|\n'
  while IFS=$'\t' read -r url result http detail; do
    printf '| `%s` | %s | %s | %s |\n' "$url" "$result" "$http" "$detail"
  done <"$results"
  printf '\n## Enforced policy\n\n'
  printf -- '- HTTP 2xx/3xx response and successful curl execution.\n'
  printf -- '- `X-Content-Type-Options: nosniff`.\n'
  printf -- '- Enforced CSP with an explicit `script-src` that excludes `unsafe-inline` and `unsafe-eval`; `style-src-attr unsafe-inline` remains permitted.\n'
  printf -- '- `X-Frame-Options` or CSP `frame-ancestors`, plus Referrer-Policy and Permissions-Policy.\n'
  printf -- '- Sensitive routes are non-publicly cacheable; cookies carry HttpOnly/SameSite and Secure on HTTPS.\n'
  printf -- '- TLS certificates are verified unless `HEADER_INSECURE_TLS=yes` is explicitly set for an authorized local fixture.\n'
  printf -- '- HSTS with a positive max-age on HTTPS targets.\n\n'
  printf 'Raw response headers: `%s`\n' "$raw"
} >"$DOC_REPORT"

printf '[%s] Wrote %s\n' "$overall_status" "$DOC_REPORT"
exit "$exit_code"
