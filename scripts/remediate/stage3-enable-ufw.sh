#!/bin/bash
# Stage 3 — UFW Firewall with Docker-aware Rules
# Third layer of defense (after Yandex SG + Docker 127.0.0.1 binding).
#
# Run: ssh yandex-vm "bash -s" < scripts/remediate/stage3-enable-ufw.sh
#
# Docker bypasses UFW by inserting iptables rules directly. The DOCKER-USER
# chain is the correct place to add pre-Docker filtering. It is called before
# Docker's own rules in the FORWARD chain.
#
# Allows:  22 (SSH), 80 (HTTP), 443 (HTTPS), 8000 (Supabase API)
# Blocks:  everything else, including 3000 and 81 via DOCKER-USER chain

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo "========================================"
echo "  Stage 3 — UFW Firewall Setup"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# Verify UFW is installed
if ! command -v ufw &>/dev/null; then
  fail "UFW not installed. Run: sudo apt install ufw"
fi
pass "UFW is installed"

# --- Safety: ensure SSH rule is added FIRST before any enable ---
echo ""
echo "--- 1. Adding allow rules (SSH first for safety) ---"

sudo ufw allow 22/tcp comment 'SSH'
pass "Allowed: 22/tcp (SSH)"

sudo ufw allow 80/tcp comment 'HTTP'
pass "Allowed: 80/tcp (HTTP)"

sudo ufw allow 443/tcp comment 'HTTPS'
pass "Allowed: 443/tcp (HTTPS)"

sudo ufw allow 8000/tcp comment 'Supabase API (Kong)'
pass "Allowed: 8000/tcp (Supabase API)"

# --- Set defaults ---
echo ""
echo "--- 2. Setting default policies ---"

sudo ufw default deny incoming
pass "Default incoming: DENY"

sudo ufw default allow outgoing
pass "Default outgoing: ALLOW"

# --- DOCKER-USER chain rules ---
# These fire BEFORE Docker's own iptables rules in the FORWARD chain.
# Drops any external traffic to admin ports on eth0 as a third layer.
echo ""
echo "--- 3. Adding DOCKER-USER chain rules ---"

# Remove any existing admin-port DROP rules to avoid duplicates
sudo iptables -D DOCKER-USER -i eth0 -p tcp --dport 3000 -j DROP 2>/dev/null || true
sudo iptables -D DOCKER-USER -i eth0 -p tcp --dport 81 -j DROP 2>/dev/null || true

# Add DROP rules for admin ports on the external interface
sudo iptables -I DOCKER-USER 1 -i eth0 -p tcp --dport 81 -j DROP
sudo iptables -I DOCKER-USER 1 -i eth0 -p tcp --dport 3000 -j DROP
pass "DOCKER-USER: DROP eth0 → port 3000"
pass "DOCKER-USER: DROP eth0 → port 81"

# Make the DOCKER-USER rules persistent by appending to UFW's after.rules.
# UFW re-applies after.rules on every enable/restart, so this survives reboots
# without needing iptables-persistent.
echo ""
echo "--- 4. Persisting DOCKER-USER rules via UFW after.rules ---"

if sudo grep -q 'DOCKER-USER' /etc/ufw/after.rules; then
  pass "DOCKER-USER rules already present in /etc/ufw/after.rules"
else
  sudo tee -a /etc/ufw/after.rules > /dev/null <<'EOFRULES'

# --- Docker-aware admin port protection ---
# Applied before Docker's own iptables rules via the DOCKER-USER chain.
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -i eth0 -p tcp --dport 3000 -j DROP
-A DOCKER-USER -i eth0 -p tcp --dport 81 -j DROP
-A DOCKER-USER -j RETURN
COMMIT
EOFRULES
  pass "DOCKER-USER rules appended to /etc/ufw/after.rules"
fi

# --- Enable UFW ---
echo ""
echo "--- 5. Enabling UFW ---"

sudo ufw --force enable
pass "UFW enabled"

# --- Verify ---
echo ""
echo "--- 6. Verification ---"

sudo ufw status verbose

echo ""
echo "DOCKER-USER chain:"
sudo iptables -L DOCKER-USER -n --line-numbers

echo ""
echo "========================================"
echo "  Stage 3 Complete"
echo "========================================"
