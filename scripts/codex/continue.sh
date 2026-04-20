#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LEDGER_FILE="${ROOT_DIR}/docs/EXECUTION_LEDGER.md"
CURRENT_ROUND="${1:-}"
ROUNDS=(R00 R01 R02 R03 R04 R05 R06 R07 R08 R09 R10)

if [[ ! -f "${LEDGER_FILE}" ]]; then
  echo "Ledger file not found: ${LEDGER_FILE}" >&2
  exit 1
fi

if [[ -z "${CURRENT_ROUND}" ]]; then
  CURRENT_ROUND="$(grep -E '^### Round R[0-9]{2}$' "${LEDGER_FILE}" | tail -n 1 | awk '{print $3}')"
fi

if [[ -z "${CURRENT_ROUND}" ]]; then
  echo "Unable to determine current round from ledger." >&2
  exit 1
fi

CURRENT_INDEX=-1
for i in "${!ROUNDS[@]}"; do
  if [[ "${ROUNDS[$i]}" == "${CURRENT_ROUND}" ]]; then
    CURRENT_INDEX="${i}"
    break
  fi
done

if [[ "${CURRENT_INDEX}" -lt 0 ]]; then
  echo "Unknown round: ${CURRENT_ROUND}" >&2
  exit 1
fi

if ! awk "/^### Round ${CURRENT_ROUND}\$/,/^### Round /" "${LEDGER_FILE}" | grep -q '^#### Decision'; then
  echo "Decision not recorded for ${CURRENT_ROUND}. Update the ledger first." >&2
  exit 1
fi

DECISION="$(awk "/^### Round ${CURRENT_ROUND}\$/,/^### Round /" "${LEDGER_FILE}" | awk 'found && NF { print; exit } /^#### Decision$/ { found=1 }')"

if [[ "${DECISION}" != "CONTINUE" ]]; then
  echo "Current round decision is '${DECISION}', not CONTINUE. Stop here."
  exit 0
fi

NEXT_INDEX=$((CURRENT_INDEX + 1))
if [[ "${NEXT_INDEX}" -ge "${#ROUNDS[@]}" ]]; then
  echo "No further rounds. Delivery flow is complete."
  exit 0
fi

NEXT_ROUND="${ROUNDS[$NEXT_INDEX]}"
echo "Next round: ${NEXT_ROUND}"
"${ROOT_DIR}/scripts/codex/run-round.sh" "${NEXT_ROUND}"
