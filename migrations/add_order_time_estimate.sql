-- Add timeEstimate field to orders table
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- This allows specifying the time estimate (in days) for order completion

-- Add column without default (default will be handled by frontend)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS "timeEstimate" INTEGER;

-- Update existing orders that have NULL timeEstimate to default 14 days
UPDATE orders
SET "timeEstimate" = 14
WHERE "timeEstimate" IS NULL;

-- Add comment to column for documentation
COMMENT ON COLUMN orders."timeEstimate" IS 'Time estimate for order completion in days (default handled by frontend)';

