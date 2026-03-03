#!/bin/bash
# Security Audit Script — service-mk.ru Infrastructure
#
# Read-only PASS/FAIL check of all security controls.
# Run from your local machine:
#   ssh yandex-vm "bash -s" < scripts/security-audit.sh
#
# Checks (7 layers):
#   1. UFW firewall rules
#   2. Docker port bindings (admin ports locked to 127.0.0.1)
#   3. Kong API gateway (Studio route removed)
#   4. NGINX Proxy Manager (studio.service-mk.ru disabled)
#   5. External exposure (live HTTP probes)
#   6. Database security (RLS, roles, connections)
#   7. SSH & file permissions
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARN=$((WARN + 1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
PASS=0; WARN=0; FAIL=0

# Use docker exec directly with /dev/null stdin to avoid consuming bash -s script stdin
PSQL="sudo docker exec supabase-db psql -U postgres -d postgres"
VM_IP=$(curl -s --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || \
        ip route get 1 | awk '{print $7;exit}' 2>/dev/null || echo "unknown")

echo "========================================"
echo -e "  ${BOLD}Security Audit — service-mk.ru${NC}"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  VM IP: $VM_IP"
echo "========================================"

# ─────────────────────────────────────────
echo ""
echo "─── Layer 1: UFW Firewall ───"

if sudo ufw status | grep -q "Status: active"; then
  pass "UFW is active"
else
  fail "UFW is INACTIVE — host-level firewall is off"
fi

for PORT in 22 80 443 8000; do
  if sudo ufw status | grep -qE "^${PORT}(/tcp)?[[:space:]]+ALLOW"; then
    pass "UFW allows $PORT (expected public port)"
  else
    warn "UFW rule for port $PORT not found — verify manually"
  fi
done

# Port 8080 should only be accessible from Docker bridge (172.16.0.0/12)
if sudo ufw status | grep -qE "8080.*172\.1[67]\."; then
  pass "UFW port 8080 restricted to Docker bridge only (172.16.0.0/12)"
else
  warn "UFW port 8080 rule not found — CRM nginx may be inaccessible from NPM"
fi

# Ports 3000 and 81 must NOT be publicly allowed
for PORT in 3000 81; do
  if sudo ufw status | grep -qE "^${PORT}[[:space:]]+ALLOW[[:space:]]+Anywhere"; then
    fail "UFW publicly allows port $PORT — admin interface exposed!"
  else
    pass "UFW does not publicly expose port $PORT"
  fi
done

# ─────────────────────────────────────────
echo ""
echo "─── Layer 2: Docker Port Bindings ───"

STUDIO_PORTS=$(sudo docker ps --format '{{.Names}}\t{{.Ports}}' | grep supabase-studio || echo "")
NPM_PORTS=$(sudo docker ps --format '{{.Names}}\t{{.Ports}}' | grep nginx-proxy-manager || echo "")
DB_PORTS=$(sudo docker ps --format '{{.Names}}\t{{.Ports}}' | grep supabase-db || echo "")

if echo "$STUDIO_PORTS" | grep -q "127.0.0.1:3000"; then
  pass "Studio port 3000 bound to 127.0.0.1 only"
elif echo "$STUDIO_PORTS" | grep -q "0.0.0.0:3000"; then
  fail "Studio port 3000 bound to 0.0.0.0 — PUBLICLY ACCESSIBLE"
else
  warn "Studio port binding unclear: $STUDIO_PORTS"
fi

if echo "$NPM_PORTS" | grep -q "127.0.0.1:81"; then
  pass "NPM admin port 81 bound to 127.0.0.1 only"
elif echo "$NPM_PORTS" | grep -q "0.0.0.0:81"; then
  fail "NPM admin port 81 bound to 0.0.0.0 — PUBLICLY ACCESSIBLE"
else
  warn "NPM port 81 binding unclear: $NPM_PORTS"
fi

if echo "$DB_PORTS" | grep -qE "0\.0\.0\.0:5432|127\.0\.0\.1:5432"; then
  fail "PostgreSQL port 5432 is exposed on host — should be internal only"
else
  pass "PostgreSQL port 5432 not exposed on host (Docker-internal only)"
fi

# ─────────────────────────────────────────
echo ""
echo "─── Layer 3: Kong API Gateway ───"

KONG_CONF=~/supabase/docker/volumes/api/kong.yml

if [ -f "$KONG_CONF" ]; then
  if grep -q "dashboard" "$KONG_CONF"; then
    fail "Kong config still has 'dashboard' (Studio proxy) route — Studio accessible via API domain"
  else
    pass "Kong config: Studio (dashboard) route removed"
  fi

  if grep -q "basicauth_credentials" "$KONG_CONF"; then
    fail "Kong config still has basicauth_credentials for Dashboard consumer"
  else
    pass "Kong config: Dashboard basic-auth credentials removed"
  fi

  if grep -qE "^  - username: DASHBOARD" "$KONG_CONF"; then
    fail "Kong config still has DASHBOARD consumer"
  else
    pass "Kong config: DASHBOARD consumer removed"
  fi
else
  warn "Kong config file not found at $KONG_CONF"
fi

# ─────────────────────────────────────────
echo ""
echo "─── Layer 4: NGINX Proxy Manager ───"

NPM_PROXY_DIR=~/nginx-proxy-manager/data/nginx/proxy_host

if [ -f "${NPM_PROXY_DIR}/5.conf" ]; then
  fail "NPM studio.service-mk.ru proxy host (5.conf) is ACTIVE — Studio may be publicly accessible"
elif [ -f "${NPM_PROXY_DIR}/5.conf.disabled" ]; then
  pass "NPM studio.service-mk.ru proxy host disabled (5.conf.disabled)"
else
  pass "NPM studio.service-mk.ru proxy host does not exist"
fi

if [ -f "${NPM_PROXY_DIR}/6.conf" ]; then
  pass "NPM crm.service-mk.ru proxy host (6.conf) is present"
else
  warn "NPM crm.service-mk.ru proxy host (6.conf) not found"
fi

# ─────────────────────────────────────────
echo ""
echo "─── Layer 5: External Exposure Checks ───"

# Helper: get HTTP status without exit-code doubling
http_status() { curl -s -o /dev/null -w "%{http_code}" --max-time "${2:-8}" "$1" 2>/dev/null; true; }

# Studio must not be accessible via API domain root
ROOT_STATUS=$(http_status https://supabase.service-mk.ru/)
if [ "$ROOT_STATUS" = "404" ]; then
  pass "supabase.service-mk.ru/ returns 404 (Studio route removed)"
elif [ "$ROOT_STATUS" = "401" ]; then
  fail "supabase.service-mk.ru/ returns 401 — Studio route still active in Kong (basic-auth blocking but not removed)"
elif [ "$ROOT_STATUS" = "000" ]; then
  warn "supabase.service-mk.ru/ timed out — could not verify"
else
  fail "supabase.service-mk.ru/ returns $ROOT_STATUS — investigate"
fi

# Studio direct NPM domain must be inaccessible
STUDIO_DOMAIN_STATUS=$(http_status https://studio.service-mk.ru/)
if [ "$STUDIO_DOMAIN_STATUS" = "000" ] || [ "$STUDIO_DOMAIN_STATUS" = "502" ] || [ "$STUDIO_DOMAIN_STATUS" = "404" ]; then
  pass "studio.service-mk.ru inaccessible (HTTP $STUDIO_DOMAIN_STATUS)"
else
  fail "studio.service-mk.ru returns $STUDIO_DOMAIN_STATUS — may be accessible"
fi

# Supabase auth API must work
AUTH_STATUS=$(http_status https://supabase.service-mk.ru/auth/v1/health)
if [ "$AUTH_STATUS" = "200" ] || [ "$AUTH_STATUS" = "401" ]; then
  pass "supabase.service-mk.ru/auth/v1/ reachable (HTTP $AUTH_STATUS — API working)"
else
  fail "supabase.service-mk.ru/auth/v1/ returned $AUTH_STATUS — API may be broken"
fi

# CRM must be accessible
CRM_STATUS=$(http_status https://crm.service-mk.ru/ 15)
if [ "$CRM_STATUS" = "200" ]; then
  pass "crm.service-mk.ru accessible (HTTP 200)"
elif [ "$CRM_STATUS" = "000" ]; then
  warn "crm.service-mk.ru timed out from VM (normal for hairpin NAT) — verify from external browser"
else
  fail "crm.service-mk.ru returned $CRM_STATUS"
fi

# Direct IP port 3000 must be blocked
DIRECT_3000=$(http_status "http://$VM_IP:3000" 5)
if [ "$DIRECT_3000" = "000" ]; then
  pass "Direct IP:3000 not reachable (Studio blocked)"
else
  fail "Direct IP:3000 returned $DIRECT_3000 — Studio may be publicly accessible"
fi

# Direct IP port 81 must be blocked
DIRECT_81=$(http_status "http://$VM_IP:81" 5)
if [ "$DIRECT_81" = "000" ]; then
  pass "Direct IP:81 not reachable (NPM admin blocked)"
else
  fail "Direct IP:81 returned $DIRECT_81 — NPM admin may be publicly accessible"
fi

# ─────────────────────────────────────────
echo ""
echo "─── Layer 6: Database Security ───"

# RLS check
RLS_OFF=$($PSQL -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;" </dev/null 2>/dev/null | tr -d ' ') || RLS_OFF="err"
if [ "$RLS_OFF" = "0" ]; then
  pass "RLS enabled on all public tables"
elif [ "$RLS_OFF" = "err" ]; then
  warn "Could not query RLS status — database may be unavailable"
else
  fail "$RLS_OFF public table(s) have RLS disabled"
  $PSQL -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;" </dev/null 2>/dev/null || true
fi

# Unexpected superusers
UNEXPECTED_SUPERS=$($PSQL -t -c "SELECT rolname FROM pg_roles WHERE rolsuper=true AND rolname NOT IN ('postgres','supabase_admin') ORDER BY rolname;" </dev/null 2>/dev/null | tr -d ' ' | grep -v '^$') || UNEXPECTED_SUPERS=""
if [ -z "$UNEXPECTED_SUPERS" ]; then
  pass "No unexpected superuser roles (only postgres and supabase_admin)"
else
  fail "Unexpected superuser role(s) found: $UNEXPECTED_SUPERS"
fi

# External DB connections
EXT_CONNS=$($PSQL -t -c "SELECT COUNT(*) FROM pg_stat_activity WHERE client_addr IS NOT NULL AND client_addr NOT LIKE '172.%' AND client_addr != '127.0.0.1' AND datname='postgres';" </dev/null 2>/dev/null | tr -d ' ') || EXT_CONNS="0"
if [ "$EXT_CONNS" = "0" ]; then
  pass "No external connections to PostgreSQL"
else
  fail "$EXT_CONNS unexpected external DB connection(s)"
fi

# Unknown tables
KNOWN_TABLES=("clients" "company_settings" "job_presets" "job_templates" "order_jobs" "orders" "preset_jobs")
ALL_TABLES=$($PSQL -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" </dev/null 2>/dev/null | tr -d ' ' | grep -v '^$') || ALL_TABLES=""
UNKNOWN_FOUND=0
for TABLE in $ALL_TABLES; do
  FOUND=false
  for K in "${KNOWN_TABLES[@]}"; do [[ "$TABLE" == "$K" ]] && FOUND=true && break; done
  if [ "$FOUND" = false ]; then
    fail "Unknown table in public schema: '$TABLE'"
    UNKNOWN_FOUND=$((UNKNOWN_FOUND + 1))
  fi
done
if [ "$UNKNOWN_FOUND" = "0" ]; then
  ACTUAL_COUNT=$(echo "$ALL_TABLES" | grep -c '[a-z]') || ACTUAL_COUNT=0
  pass "Public schema: $ACTUAL_COUNT/${#KNOWN_TABLES[@]} expected tables, no unknown tables"
fi

# ─────────────────────────────────────────
echo ""
echo "─── Layer 7: SSH & File Permissions ───"

# Password auth disabled
SSH_PASS_SETTING=$(sudo sshd -T 2>/dev/null | grep '^passwordauthentication ' | awk '{print $2}') || SSH_PASS_SETTING=""
if [ "$SSH_PASS_SETTING" = "no" ]; then
  pass "SSH password authentication disabled"
elif [ -z "$SSH_PASS_SETTING" ]; then
  warn "Could not determine SSH password auth setting — check /etc/ssh/sshd_config manually"
else
  fail "SSH password authentication is '$SSH_PASS_SETTING' — should be 'no'"
fi

# .env file permissions
ENV_PERMS=$(stat -c "%a" ~/supabase/docker/.env 2>/dev/null || echo "unknown")
if [[ "$ENV_PERMS" =~ ^[46]00$ ]]; then
  pass ".env file permissions: $ENV_PERMS (owner read-only)"
elif [ "$ENV_PERMS" = "640" ] || [ "$ENV_PERMS" = "660" ]; then
  warn ".env file permissions: $ENV_PERMS (group-readable — consider chmod 600)"
else
  fail ".env file permissions: $ENV_PERMS — too permissive"
fi

# DOCKER-USER chain blocks ports 3000 and 81
DOCKER_USER_3000=$(sudo iptables -L DOCKER-USER -n 2>/dev/null | grep -c "dpt:3000" || echo "0")
DOCKER_USER_81=$(sudo iptables -L DOCKER-USER -n 2>/dev/null | grep -c "dpt:81" || echo "0")

if [ "$DOCKER_USER_3000" -gt "0" ]; then
  pass "iptables DOCKER-USER chain blocks port 3000"
else
  warn "DOCKER-USER iptables rule for port 3000 not found (may not survive reboot without after.rules)"
fi

if [ "$DOCKER_USER_81" -gt "0" ]; then
  pass "iptables DOCKER-USER chain blocks port 81"
else
  warn "DOCKER-USER iptables rule for port 81 not found (may not survive reboot without after.rules)"
fi

# after.rules contains DOCKER-USER persistence
if sudo grep -q "DOCKER-USER" /etc/ufw/after.rules 2>/dev/null; then
  pass "UFW after.rules has persistent DOCKER-USER chain rules"
else
  warn "/etc/ufw/after.rules missing DOCKER-USER rules — port blocks may not survive reboot"
fi

# ─────────────────────────────────────────
echo ""
echo "========================================"
echo -e "  ${BOLD}Summary: ${GREEN}${PASS} PASS${NC} | ${YELLOW}${WARN} WARN${NC} | ${RED}${FAIL} FAIL${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo -e "  ${RED}ACTION REQUIRED: $FAIL critical issue(s) found above.${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo ""
  echo -e "  ${YELLOW}$WARN warning(s) — review above items.${NC}"
  exit 0
else
  echo ""
  echo -e "  ${GREEN}All security controls verified.${NC}"
  exit 0
fi
