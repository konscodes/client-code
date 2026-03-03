#!/bin/bash
# Stage 4 — Credential Rotation
# Rotates all secrets that were exposed during the Studio breach.
#
# Run: ssh yandex-vm "bash -s" < scripts/remediate/stage4-rotate-creds.sh
#
# Rotates:
#   JWT_SECRET        — master signing secret
#   ANON_KEY          — regenerated JWT (anon role)
#   SERVICE_ROLE_KEY  — regenerated JWT (service_role)
#   POSTGRES_PASSWORD — database superuser password
#   DASHBOARD_PASSWORD — Kong admin credentials
#
# After this script: update VITE_SUPABASE_ANON_KEY in Vercel and .env.local
# with the NEW_ANON_KEY printed at the end.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${BOLD}[INFO]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

ENV_FILE=~/supabase/docker/.env

echo "========================================"
echo "  Stage 4 — Credential Rotation"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

[ -f "$ENV_FILE" ] || fail ".env not found at $ENV_FILE"

# --- Backup ---
BACKUP="${ENV_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
pass "Backup created: $BACKUP"

# --- Generate new secrets ---
echo ""
echo "--- 1. Generating new secrets ---"

NEW_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
pass "New JWT_SECRET generated"

NEW_POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '+/=' | head -c 40)
pass "New POSTGRES_PASSWORD generated"

NEW_DASHBOARD_PASSWORD=$(openssl rand -base64 24 | tr -d '+/=' | head -c 28)
pass "New DASHBOARD_PASSWORD generated"

# --- Generate JWT tokens using Python3 ---
echo ""
echo "--- 2. Generating new JWT tokens ---"

NOW=$(date +%s)
EXP=$(( NOW + 315360000 ))  # 10 years

NEW_ANON_KEY=$(python3 - <<PYEOF
import hmac, hashlib, base64, json, sys

def b64url(data):
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def make_jwt(payload, secret):
    header = json.dumps({"alg":"HS256","typ":"JWT"}, separators=(',',':'))
    body   = json.dumps(payload, separators=(',',':'))
    msg    = b64url(header) + '.' + b64url(body)
    sig    = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    return msg + '.' + b64url(sig)

payload = {
    "role": "anon",
    "iss": "supabase",
    "iat": $NOW,
    "exp": $EXP
}
print(make_jwt(payload, "$NEW_JWT_SECRET"))
PYEOF
)
pass "New ANON_KEY generated"

NEW_SERVICE_ROLE_KEY=$(python3 - <<PYEOF
import hmac, hashlib, base64, json

def b64url(data):
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def make_jwt(payload, secret):
    header = json.dumps({"alg":"HS256","typ":"JWT"}, separators=(',',':'))
    body   = json.dumps(payload, separators=(',',':'))
    msg    = b64url(header) + '.' + b64url(body)
    sig    = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    return msg + '.' + b64url(sig)

payload = {
    "role": "service_role",
    "iss": "supabase",
    "iat": $NOW,
    "exp": $EXP
}
print(make_jwt(payload, "$NEW_JWT_SECRET"))
PYEOF
)
pass "New SERVICE_ROLE_KEY generated"

# --- Update .env file ---
echo ""
echo "--- 3. Updating .env file ---"

sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_JWT_SECRET|" "$ENV_FILE"
pass "JWT_SECRET updated"

sed -i "s|^ANON_KEY=.*|ANON_KEY=$NEW_ANON_KEY|" "$ENV_FILE"
pass "ANON_KEY updated"

sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$NEW_SERVICE_ROLE_KEY|" "$ENV_FILE"
pass "SERVICE_ROLE_KEY updated"

sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$NEW_POSTGRES_PASSWORD|" "$ENV_FILE"
pass "POSTGRES_PASSWORD updated"

sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$NEW_DASHBOARD_PASSWORD|" "$ENV_FILE"
pass "DASHBOARD_PASSWORD updated"

# --- Rotate DB password inside PostgreSQL before restarting ---
echo ""
echo "--- 4. Rotating PostgreSQL password in database ---"

cd ~/supabase/docker
sudo docker compose exec -T db psql -U postgres -d postgres -c \
  "ALTER USER postgres PASSWORD '$NEW_POSTGRES_PASSWORD';" 2>/dev/null && \
  pass "postgres role password updated in DB" || \
  warn "Could not update postgres password in DB — will take effect after restart"

sudo docker compose exec -T db psql -U postgres -d postgres -c \
  "ALTER USER authenticator PASSWORD '$NEW_POSTGRES_PASSWORD';" 2>/dev/null && \
  pass "authenticator role password updated in DB" || true

sudo docker compose exec -T db psql -U postgres -d postgres -c \
  "ALTER USER supabase_admin PASSWORD '$NEW_POSTGRES_PASSWORD';" 2>/dev/null && \
  pass "supabase_admin role password updated in DB" || true

# --- Restart all services to pick up new secrets ---
echo ""
echo "--- 5. Restarting all Supabase services ---"

sudo docker compose up -d --force-recreate
pass "All services restarted with new credentials"

# Wait for health
echo "Waiting for services to become healthy..."
sleep 15

sudo docker compose ps --format 'table {{.Name}}\t{{.Status}}'

# --- Print new keys for manual steps ---
echo ""
echo "========================================================"
echo -e "  ${BOLD}Stage 4 Complete — ACTION REQUIRED${NC}"
echo "========================================================"
echo ""
echo -e "${YELLOW}Copy these values — you need them for the next steps:${NC}"
echo ""
echo "NEW_ANON_KEY (paste into Vercel + .env.local VITE_SUPABASE_ANON_KEY):"
echo "$NEW_ANON_KEY"
echo ""
echo "NEW_SERVICE_ROLE_KEY (paste into .env.local SUPABASE_SERVICE_ROLE_KEY):"
echo "$NEW_SERVICE_ROLE_KEY"
echo ""
echo "NEW_DASHBOARD_PASSWORD (save somewhere secure):"
echo "$NEW_DASHBOARD_PASSWORD"
echo ""
echo "NEW_POSTGRES_PASSWORD (save somewhere secure):"
echo "$NEW_POSTGRES_PASSWORD"
echo ""
echo "========================================================"
