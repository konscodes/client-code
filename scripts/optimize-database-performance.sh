#!/bin/bash
# Database Performance Optimization Script
# Applies critical indexes and optimizations to improve query performance

set -e

echo "=== Database Performance Optimization ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if SSH_HOST_ALIAS is set
if [ -z "$SSH_HOST_ALIAS" ]; then
    echo -e "${YELLOW}SSH_HOST_ALIAS not set. Using default: yandex-vm${NC}"
    SSH_HOST_ALIAS="yandex-vm"
fi

echo "Connecting to: $SSH_HOST_ALIAS"
echo ""

# Step 1: Create critical indexes
echo -e "${GREEN}Step 1: Creating critical indexes...${NC}"
ssh "$SSH_HOST_ALIAS" "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres << 'SQL'
-- Index for order_jobs.orderId (CRITICAL - used in .in() queries)
CREATE INDEX IF NOT EXISTS idx_order_jobs_order_id ON public.order_jobs(\"orderId\");

-- Index for orders.createdAt (used for sorting)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(\"createdAt\" DESC);

-- Index for order_jobs.position (used for sorting within orders)
CREATE INDEX IF NOT EXISTS idx_order_jobs_position ON public.order_jobs(\"orderId\", position);

-- Index for orders.clientId (used for filtering)
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders(\"clientId\");

-- Verify indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
SQL
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Indexes created successfully${NC}"
else
    echo -e "${RED}✗ Failed to create indexes${NC}"
    exit 1
fi

echo ""

# Step 2: Vacuum clients table
echo -e "${GREEN}Step 2: Vacuuming clients table...${NC}"
ssh "$SSH_HOST_ALIAS" "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  'VACUUM ANALYZE public.clients;'"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Clients table vacuumed successfully${NC}"
else
    echo -e "${RED}✗ Failed to vacuum clients table${NC}"
    exit 1
fi

echo ""

# Step 3: Show index usage statistics
echo -e "${GREEN}Step 3: Index usage statistics...${NC}"
ssh "$SSH_HOST_ALIAS" "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT schemaname, relname as table_name, indexrelname as index_name, idx_scan, idx_tup_read 
   FROM pg_stat_user_indexes 
   WHERE schemaname = 'public' 
     AND indexrelname LIKE 'idx_%'
   ORDER BY idx_scan DESC;\""

echo ""

# Step 4: Show table statistics
echo -e "${GREEN}Step 4: Table statistics (dead tuple ratio)...${NC}"
ssh "$SSH_HOST_ALIAS" "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT schemaname, relname as table_name, n_live_tup, n_dead_tup, 
          ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
   FROM pg_stat_user_tables 
   WHERE schemaname = 'public'
   ORDER BY dead_pct DESC;\""

echo ""
echo -e "${GREEN}=== Optimization Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Update application code to reduce batch size from 1000 to 200"
echo "2. Monitor query performance"
echo "3. Check console for errors (should be resolved)"
echo ""
echo "See docs/PERFORMANCE_OPTIMIZATION_REPORT.md for details"

