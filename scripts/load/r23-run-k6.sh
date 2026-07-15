#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILE="${1:-}"
SESSION_FILE="${K6_SESSION_FILE:-}"
TEST_RUN_ID="${K6_TEST_RUN_ID:-}"
K6_IMAGE="${K6_IMAGE:-grafana/k6:latest}"

case "$PROFILE" in
  preflight)
    SCRIPT_NAME="r23-auth-preflight.js"
    DURATION="${K6_DURATION:-10m}"
    IDLE_DURATION="${K6_IDLE_DURATION:-1m}"
    SAMPLE_EVERY="${K6_SAMPLE_EVERY:-1m}"
    ;;
  5vu-2h)
    SCRIPT_NAME="r23-authenticated-5vu-2h.js"
    DURATION="${K6_DURATION:-2h}"
    IDLE_DURATION="${K6_IDLE_DURATION:-5m}"
    SAMPLE_EVERY="${K6_SAMPLE_EVERY:-10m}"
    ;;
  10vu-30m)
    SCRIPT_NAME="r23-authenticated-10vu-30m.js"
    DURATION="${K6_DURATION:-30m}"
    IDLE_DURATION="${K6_IDLE_DURATION:-5m}"
    SAMPLE_EVERY="${K6_SAMPLE_EVERY:-10m}"
    ;;
  *)
    echo "用法：K6_SESSION_FILE=/tmp/r23-auth.*/k6-session.json K6_TEST_RUN_ID=... $0 {preflight|5vu-2h|10vu-30m}" >&2
    exit 2
    ;;
esac

if [[ ! "$SESSION_FILE" = /tmp/r23-auth.*/* ]] || [[ ! -f "$SESSION_FILE" ]]; then
  echo "K6_SESSION_FILE 必须是 /tmp/r23-auth.* 下的现有文件。" >&2
  exit 2
fi
if [[ ! "$TEST_RUN_ID" =~ ^[A-Za-z0-9_-]{8,120}$ ]]; then
  echo "K6_TEST_RUN_ID 格式不安全。" >&2
  exit 2
fi

SESSION_DIR="$(dirname "$SESSION_FILE")"
RESULT_DIR="$ROOT_DIR/test-results/r23c/$PROFILE/$TEST_RUN_ID"
mkdir -p "$RESULT_DIR"

node "$ROOT_DIR/scripts/load/r23-resource-monitor.mjs" \
  --duration "$DURATION" \
  --idle-duration "$IDLE_DURATION" \
  --sample-every "$SAMPLE_EVERY" \
  --test-run-id "$TEST_RUN_ID" \
  --output "$RESULT_DIR/monitor.json" &
MONITOR_PID=$!

cleanup_monitor() {
  if kill -0 "$MONITOR_PID" 2>/dev/null; then
    kill "$MONITOR_PID" 2>/dev/null || true
    wait "$MONITOR_PID" 2>/dev/null || true
  fi
}
trap cleanup_monitor EXIT INT TERM

set +e
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "$ROOT_DIR/scripts/load:/scripts:ro" \
  -v "$RESULT_DIR:/results" \
  -v "$SESSION_DIR:$SESSION_DIR:ro" \
  -w /scripts \
  -e "K6_SESSION_FILE=$SESSION_FILE" \
  -e "K6_TEST_RUN_ID=$TEST_RUN_ID" \
  -e "K6_DURATION=$DURATION" \
  -e "K6_BASE_URL=http://host.docker.internal:8080" \
  -e "K6_BROWSER_ORIGIN=http://localhost:8080" \
  -e "K6_SUMMARY_PATH=/results/summary.json" \
  "$K6_IMAGE" run "$SCRIPT_NAME" 2>&1 | tee "$RESULT_DIR/k6.log"
K6_RC=${PIPESTATUS[0]}
set -e

if [[ "$K6_RC" -ne 0 ]]; then
  echo "k6 $PROFILE 失败，停止后续阶段。" >&2
  exit "$K6_RC"
fi

wait "$MONITOR_PID"
trap - EXIT INT TERM
echo "R23C $PROFILE 已完成，结果目录：$RESULT_DIR"
