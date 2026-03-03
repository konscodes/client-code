#!/bin/bash
# Stage 1 — Database Integrity Audit & Cleanup
# Run: ssh yandex-vm "bash -s" < scripts/remediate/stage1-db-audit.sh
#
# Checks:
#   - No unexpected tables in public schema
#   - All tables have RLS enabled with at least one policy
#   - Row counts for manual comparison against backups
#   - No unexpected DB roles/superusers
#   - No suspicious active connections from external IPs
#   - Drops any tables not in the known-good whitelist

set -euo pipefail

PSQL="sudo docker compose -f ~/supabase/docker/docker-compose.yml exec -T db psql -U postgres -d postgres"
PASS=0; WARN=0; FAIL=0

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN++)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); }

echo "========================================"
echo "  Stage 1 — DB Audit & Cleanup"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# Known-good table whitelist
KNOWN_TABLES=("clients" "company_settings" "job_presets" "job_templates" "order_jobs" "orders" "preset_jobs")

echo ""
echo "--- 1. Table Inventory ---"

TABLES=$($PSQL -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null | tr -d ' ')

UNKNOWN_TABLES=()
for TABLE in $TABLES; do
  FOUND=false
  for KNOWN in "${KNOWN_TABLES[@]}"; do
    [[ "$TABLE" == "$KNOWN" ]] && FOUND=true && break
  done
  if [ "$FOUND" = false ]; then
    UNKNOWN_TABLES+=("$TABLE")
    fail "Unknown table found: '$TABLE' — dropping it"
    $PSQL -c "DROP TABLE IF EXISTS public.\"$TABLE\";" 2>/dev/null && echo "  Dropped: $TABLE"
  fi
done

if [ ${#UNKNOWN_TABLES[@]} -eq 0 ]; then
  pass "All public tables are in the known-good whitelist"
fi

echo ""
echo "--- 2. RLS Status ---"

RLS_RESULTS=$($PSQL -t -c "
  SELECT tablename || ':' || rowsecurity::text || ':' ||
         (SELECT COUNT(*)::text FROM pg_policies WHERE tablename=t.tablename AND schemaname='public')
  FROM pg_tables t WHERE schemaname='public' ORDER BY tablename;
" 2>/dev/null | tr -d ' ')

for ROW in $RLS_RESULTS; do
  TABLE=$(echo "$ROW" | cut -d: -f1)
  RLS=$(echo "$ROW" | cut -d: -f2)
  POLICIES=$(echo "$ROW" | cut -d: -f3)
  if [ "$RLS" = "t" ] && [ "$POLICIES" -gt "0" ]; then
    pass "RLS ON + $POLICIES policy on: $TABLE"
  elif [ "$RLS" = "t" ] && [ "$POLICIES" -eq "0" ]; then
    warn "RLS ON but NO policies on: $TABLE (no access allowed — check if intentional)"
  else
    fail "RLS OFF on: $TABLE — enabling now"
    $PSQL -c "ALTER TABLE public.\"$TABLE\" ENABLE ROW LEVEL SECURITY;" 2>/dev/null
  fi
done

echo ""
echo "--- 3. Row Counts ---"
echo "(Compare these against your last backup to verify data integrity)"

$PSQL -c "
SELECT table_name, row_count FROM (
  SELECT 'clients'          as table_name, COUNT(*) as row_count FROM clients
  UNION ALL SELECT 'orders',              COUNT(*) FROM orders
  UNION ALL SELECT 'order_jobs',          COUNT(*) FROM order_jobs
  UNION ALL SELECT 'job_templates',       COUNT(*) FROM job_templates
  UNION ALL SELECT 'job_presets',         COUNT(*) FROM job_presets
  UNION ALL SELECT 'preset_jobs',         COUNT(*) FROM preset_jobs
  UNION ALL SELECT 'company_settings',    COUNT(*) FROM company_settings
) t ORDER BY table_name;
" 2>/dev/null

echo ""
echo "--- 4. Database Roles ---"

SUPERUSERS=$($PSQL -t -c "
  SELECT rolname FROM pg_roles WHERE rolsuper = true ORDER BY rolname;
" 2>/dev/null | tr -d ' ' | grep -v '^$')

EXPECTED_SUPERS=("postgres" "supabase_admin")
for ROLE in $SUPERUSERS; do
  EXPECTED=false
  for E in "${EXPECTED_SUPERS[@]}"; do
    [[ "$ROLE" == "$E" ]] && EXPECTED=true && break
  done
  if [ "$EXPECTED" = true ]; then
    pass "Superuser role is expected: $ROLE"
  else
    fail "Unexpected superuser role: $ROLE — investigate immediately"
  fi
done

echo ""
echo "--- 5. Active Connections ---"

EXTERNAL_CONNS=$($PSQL -t -c "
  SELECT COUNT(*) FROM pg_stat_activity
  WHERE client_addr IS NOT NULL
    AND client_addr NOT LIKE '172.%'
    AND client_addr != '127.0.0.1'
    AND datname = 'postgres';
" 2>/dev/null | tr -d ' ')

if [ "$EXTERNAL_CONNS" = "0" ]; then
  pass "No external connections to the database"
else
  fail "$EXTERNAL_CONNS unexpected external connection(s) detected:"
  $PSQL -c "
    SELECT pid, usename, client_addr, state, LEFT(query,60) as query
    FROM pg_stat_activity
    WHERE client_addr IS NOT NULL
      AND client_addr NOT LIKE '172.%'
      AND client_addr != '127.0.0.1'
      AND datname = 'postgres';
  " 2>/dev/null
fi

echo ""
echo "========================================"
echo "  Summary: ${PASS} PASS | ${WARN} WARN | ${FAIL} FAIL"
echo "========================================"
