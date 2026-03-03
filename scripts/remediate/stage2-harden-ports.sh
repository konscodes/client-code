#!/bin/bash
# Stage 2 — Docker Port Hardening
# Binds admin ports to 127.0.0.1 only, so they are unreachable from the internet
# even if the cloud security group is accidentally reset.
#
# Run: ssh yandex-vm "bash -s" < scripts/remediate/stage2-harden-ports.sh
#
# Changes:
#   ~/supabase/docker/docker-compose.yml  : Studio 0.0.0.0:3000 → 127.0.0.1:3000
#   ~/nginx-proxy-manager/docker-compose.yml : NPM admin 0.0.0.0:81 → 127.0.0.1:81

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo "========================================"
echo "  Stage 2 — Docker Port Hardening"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

SUPABASE_COMPOSE=~/supabase/docker/docker-compose.yml
NPM_COMPOSE=~/nginx-proxy-manager/docker-compose.yml

# --- 1. Supabase Studio port 3000 ---
echo ""
echo "--- 1. Supabase Studio (port 3000) ---"

if [ ! -f "$SUPABASE_COMPOSE" ]; then
  fail "File not found: $SUPABASE_COMPOSE"
fi

cp "$SUPABASE_COMPOSE" "${SUPABASE_COMPOSE}.bak"
pass "Backup created: ${SUPABASE_COMPOSE}.bak"

# Change "3000:3000/tcp" to "127.0.0.1:3000:3000/tcp"
if grep -q '"127.0.0.1:3000:3000' "$SUPABASE_COMPOSE"; then
  pass "Studio already bound to 127.0.0.1 — no change needed"
else
  sed -i 's|"3000:3000/tcp"|"127.0.0.1:3000:3000/tcp"|g' "$SUPABASE_COMPOSE"
  # Also handle without /tcp suffix just in case
  sed -i 's|"3000:3000"|"127.0.0.1:3000:3000"|g' "$SUPABASE_COMPOSE"
  pass "Studio port binding updated to 127.0.0.1:3000"

  echo "Restarting supabase-studio..."
  cd ~/supabase/docker && sudo docker compose up -d --no-deps studio
  sleep 5
  pass "supabase-studio restarted"
fi

# --- 2. NGINX Proxy Manager port 81 ---
echo ""
echo "--- 2. NGINX Proxy Manager admin (port 81) ---"

if [ ! -f "$NPM_COMPOSE" ]; then
  warn "NGINX PM compose file not found at $NPM_COMPOSE — skipping"
else
  cp "$NPM_COMPOSE" "${NPM_COMPOSE}.bak"
  pass "Backup created: ${NPM_COMPOSE}.bak"

  if grep -q '127.0.0.1:81' "$NPM_COMPOSE"; then
    pass "NGINX PM admin port already bound to 127.0.0.1 — no change needed"
  else
    sed -i "s|- '81:81'|- '127.0.0.1:81:81'|g" "$NPM_COMPOSE"
    sed -i 's|- "81:81"|- "127.0.0.1:81:81"|g' "$NPM_COMPOSE"
    pass "NGINX PM admin port binding updated to 127.0.0.1:81"

    echo "Restarting nginx-proxy-manager..."
    cd ~/nginx-proxy-manager && sudo docker compose up -d --no-deps nginx-proxy-manager
    sleep 5
    pass "nginx-proxy-manager restarted"
  fi
fi

# --- 3. Verify bindings ---
echo ""
echo "--- 3. Verifying port bindings ---"
sleep 3

STUDIO_BINDING=$(sudo docker ps --format '{{.Names}}\t{{.Ports}}' | grep supabase-studio || true)
NPM_BINDING=$(sudo docker ps --format '{{.Names}}\t{{.Ports}}' | grep nginx-proxy-manager || true)

echo "Studio:  $STUDIO_BINDING"
echo "NPM:     $NPM_BINDING"

if echo "$STUDIO_BINDING" | grep -q '0.0.0.0:3000'; then
  fail "Studio is STILL bound to 0.0.0.0:3000 — binding failed"
elif echo "$STUDIO_BINDING" | grep -q '127.0.0.1:3000'; then
  pass "Studio correctly bound to 127.0.0.1:3000 only"
else
  warn "Could not confirm Studio binding — check manually"
fi

if echo "$NPM_BINDING" | grep -q '0.0.0.0:81'; then
  fail "NGINX PM is STILL bound to 0.0.0.0:81 — binding failed"
elif echo "$NPM_BINDING" | grep -q '127.0.0.1:81'; then
  pass "NGINX PM admin correctly bound to 127.0.0.1:81 only"
else
  warn "Could not confirm NGINX PM port 81 binding — check manually"
fi

echo ""
echo "========================================"
echo "  Stage 2 Complete"
echo "========================================"
echo ""
echo "Access Studio via SSH tunnel:"
echo "  ssh -L 3000:localhost:3000 yandex-vm -N"
echo "  Then open: http://localhost:3000"
echo ""
echo "Access NGINX PM via SSH tunnel:"
echo "  ssh -L 8181:localhost:81 yandex-vm -N"
echo "  Then open: http://localhost:8181"
