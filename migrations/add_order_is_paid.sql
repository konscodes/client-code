-- Add isPaid field to orders table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- Tracks whether an order has been paid

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false;

-- Existing completed orders are treated as already paid
UPDATE orders
SET "isPaid" = true
WHERE status = 'completed'
  AND "isPaid" = false;

COMMENT ON COLUMN orders."isPaid" IS 'Whether the order has been paid. Existing completed orders are marked paid; new orders default to unpaid.';

NOTIFY pgrst, 'reload schema';
