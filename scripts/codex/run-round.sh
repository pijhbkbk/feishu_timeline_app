#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROUND_ID="${1:-}"

if [[ -z "${ROUND_ID}" ]]; then
  echo "Usage: scripts/codex/run-round.sh R00|R01|...|R10" >&2
  exit 1
fi

ROUND_FILE="${ROOT_DIR}/docs/rounds/${ROUND_ID}.md"
LEDGER_FILE="${ROOT_DIR}/docs/EXECUTION_LEDGER.md"

if [[ ! -f "${ROUND_FILE}" ]]; then
  echo "Round file not found: ${ROUND_FILE}" >&2
  exit 1
fi

if [[ ! -f "${LEDGER_FILE}" ]]; then
  echo "Ledger file not found: ${LEDGER_FILE}" >&2
  exit 1
fi

echo "Repository: ${ROOT_DIR}"
echo "Ledger: ${LEDGER_FILE}"
echo "Round: ${ROUND_ID}"
echo
echo "Read order:"
echo "1. ${ROOT_DIR}/AGENTS.md"
echo "2. ${LEDGER_FILE}"
echo "3. ${ROUND_FILE}"
echo
echo "Round brief:"
sed -n '1,120p' "${ROUND_FILE}"
