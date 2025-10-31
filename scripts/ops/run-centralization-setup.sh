#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/../.. && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "[ERROR] .env not found at project root. Please create it from docs/ENV.sample.md"
  exit 1
fi

set -a
source .env
set +a

if [ -z "${SEPOLIA_RPC_URL:-}" ] || [ -z "${PRIVATE_KEY:-}" ]; then
  echo "[ERROR] SEPOLIA_RPC_URL and PRIVATE_KEY must be set in .env"
  exit 1
fi

# 1) Create Safe if SAFE_ADDRESS is empty
if [ -z "${SAFE_ADDRESS:-}" ]; then
  if [ -z "${SAFE_OWNERS:-}" ] || [ -z "${SAFE_THRESHOLD:-}" ]; then
    echo "[ERROR] SAFE_OWNERS and SAFE_THRESHOLD must be set in .env to create a Safe"
    exit 1
  fi
  echo "[INFO] Creating Safe on sepolia..."
  npx -y @safe-global/cli safe create \
    --network sepolia \
    --rpcUrl "$SEPOLIA_RPC_URL" \
    --privateKey "$PRIVATE_KEY" \
    --threshold "$SAFE_THRESHOLD" \
    --owners "$SAFE_OWNERS" \
    --json > safe_create.json
  SAFE_ADDRESS=$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync("safe_create.json","utf8"));console.log(j.safeAddress||j.address||j.safe||"");}catch(e){process.exit(1)}')
  if [ -z "$SAFE_ADDRESS" ]; then
    echo "[ERROR] Failed to parse Safe address from safe_create.json"
    exit 1
  fi
  echo "[INFO] SAFE_ADDRESS=$SAFE_ADDRESS"
else
  echo "[INFO] Using existing SAFE_ADDRESS=$SAFE_ADDRESS"
fi

# 2) Find latest timelock deployment
DEP_FILE=$(ls -1 deployments/proxy-sepolia-*.json | tail -n1)
if [ -z "$DEP_FILE" ]; then
  echo "[ERROR] No sepolia deployment file found in deployments/"
  exit 1
fi
TIMELOCK=$(node -e 'const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));console.log(j.timelockProxy||"");' "$DEP_FILE")
if [ -z "$TIMELOCK" ]; then
  echo "[ERROR] Failed to read timelockProxy from $DEP_FILE"
  exit 1
fi
echo "[INFO] TIMELOCK=$TIMELOCK"

# 2) Assign roles
echo "[INFO] Granting multisig roles on Timelock..."
OUT_LOG="apply_roles_$(date +%s).log"
TIMELOCK="$TIMELOCK" \
MULTISIG="$SAFE_ADDRESS" \
REVOKE_DEPLOYER=1 \
  npx hardhat run scripts/apply-multisig-roles.ts --network sepolia | tee "$OUT_LOG"

TX1=$(grep -E 'tx: 0x' "$OUT_LOG" | sed -n '1p' | awk '{print $2}')
TX2=$(grep -E 'tx: 0x' "$OUT_LOG" | sed -n '2p' | awk '{print $2}')
echo "[INFO] Role grant tx1=$TX1 tx2=$TX2"

# 3) Append evidence
echo "[INFO] Appending evidence to docs/CENTRALIZATION_EVIDENCE.md"
{
  echo ""
  echo "## Multisig Role Assignment (Sepolia)"
  echo "- Multisig Safe: $SAFE_ADDRESS"
  echo "- Timelock: $TIMELOCK"
  echo "- Role grant tx-hashes: $TX1 $TX2"
} >> docs/CENTRALIZATION_EVIDENCE.md

echo "[DONE] Centralization mitigation steps completed."


